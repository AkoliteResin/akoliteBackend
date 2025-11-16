const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { connectDB } = require('../db');

// Simple admin password check for destructive actions - expects header x-admin-pass
const ADMIN_PASS = '123@Ako';
function requireAdminPassword(req, res) {
  const provided = req.headers['x-admin-pass'];
  if (!provided || provided !== ADMIN_PASS) {
    res.status(401).json({ message: 'Unauthorized: invalid admin password' });
    return false;
  }
  return true;
}

// GET /api/clients - list all clients
router.get('/', async (req, res) => {
  try {
    const { clientsCollection } = await connectDB();
    const clients = await clientsCollection.find().toArray();
    res.json(clients);
  } catch (err) {
    console.error('/api/clients GET error', err);
    res.status(500).json({ message: 'Failed to fetch clients' });
  }
});

// POST /api/clients - create a client
router.post('/', async (req, res) => {
  const { name, phone, address, email, company, gst, notes, district, state } = req.body;
  if (!name || !phone || !district || !state) return res.status(400).json({ message: 'Name, phone, district, and state are required' });
  try {
    const { clientsCollection } = await connectDB();
    const exists = await clientsCollection.findOne({ name });
    if (exists) return res.status(409).json({ message: 'Client with this name already exists' });
    const result = await clientsCollection.insertOne({ name, phone, address: address || '', email: email || '', company: company || '', gst: gst || '', notes: notes || '', district, state, createdAt: new Date() });
    const clientDoc = await clientsCollection.findOne({ _id: result.insertedId });
    res.status(201).json(clientDoc);
  } catch (err) {
    console.error('/api/clients POST error', err);
    res.status(500).json({ message: 'Failed to create client' });
  }
});

// PUT /api/clients/:id - update client
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, address, email, company, gst, notes, district, state } = req.body;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid client ID' });
  if (!name || !phone || !district || !state) return res.status(400).json({ message: 'Name, phone, district, and state are required' });
  try {
    const { clientsCollection } = await connectDB();
    const exists = await clientsCollection.findOne({ name, _id: { $ne: new ObjectId(id) } });
    if (exists) return res.status(409).json({ message: 'Another client with this name already exists' });

    const result = await clientsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { name, phone, address: address || '', email: email || '', company: company || '', gst: gst || '', notes: notes || '', district, state, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Client not found' });
    const updatedClient = await clientsCollection.findOne({ _id: new ObjectId(id) });
    res.json(updatedClient);
  } catch (err) {
    console.error('/api/clients PUT error', err);
    res.status(500).json({ message: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id - delete client (admin check)
router.delete('/:id', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid client ID' });
  try {
    const { clientsCollection } = await connectDB();
    const result = await clientsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client deleted' });
  } catch (err) {
    console.error('/api/clients DELETE error', err);
    res.status(500).json({ message: 'Failed to delete client' });
  }
});

module.exports = router;
