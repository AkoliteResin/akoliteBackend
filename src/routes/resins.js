const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../db');
const data = require('../../data');

// GET /api/resins - return resins from DB merged with static data from data.js
router.get('/', async (req, res) => {
  try {
    const { resinsCollection } = await connectDB();
    const dbItems = await resinsCollection.find().sort({ name: 1 }).toArray();
    
    // Always include static data as base
    let allResins = [...data];
    
    // Add/override with DB items (DB takes precedence by name)
    if (dbItems && dbItems.length > 0) {
      const dbNames = new Set(dbItems.map(i => i.name));
      // Remove duplicates from static data
      allResins = allResins.filter(r => !dbNames.has(r.name));
      // Add DB resins with converted IDs
      allResins = allResins.concat(dbItems.map(i => ({ ...i, _id: i._id.toString() })));
      // Sort by name
      allResins.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    res.json(allResins);
  } catch (err) {
    console.error('GET /resins error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/resins - add a new resin
router.post('/', async (req, res) => {
  const { name, rawMaterials } = req.body;
  if (!name || !Array.isArray(rawMaterials) || rawMaterials.length === 0) {
    return res.status(400).json({ message: 'Invalid input' });
  }

  try {
    const { resinsCollection } = await connectDB();
    // Prevent duplicate by name
    const exists = await resinsCollection.findOne({ name });
    if (exists) return res.status(409).json({ message: 'Resin with this name already exists' });

    const doc = { name, raw_materials: rawMaterials.map(r => ({ name: r.name, ratio: Number(r.percentage || r.ratio) })), createdAt: new Date() };
    const ins = await resinsCollection.insertOne(doc);
    const saved = await resinsCollection.findOne({ _id: ins.insertedId });
    saved._id = saved._id.toString();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /resins error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/resins/:id - update existing resin
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, rawMaterials } = req.body;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  if (!name || !Array.isArray(rawMaterials) || rawMaterials.length === 0) return res.status(400).json({ message: 'Invalid input' });

  try {
    const { resinsCollection } = await connectDB();
    const update = { $set: { name, raw_materials: rawMaterials.map(r => ({ name: r.name, ratio: Number(r.percentage || r.ratio) })), updatedAt: new Date() } };
    const result = await resinsCollection.updateOne({ _id: new ObjectId(id) }, update);
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Resin not found' });
    const saved = await resinsCollection.findOne({ _id: new ObjectId(id) });
    saved._id = saved._id.toString();
    res.json(saved);
  } catch (err) {
    console.error('PUT /resins/:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/resins/:id - delete resin
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const { resinsCollection } = await connectDB();
    const result = await resinsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Resin not found' });
    res.json({ message: 'Resin deleted' });
  } catch (err) {
    console.error('DELETE /resins/:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
