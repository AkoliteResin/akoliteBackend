const express = require('express');
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

const router = express.Router();

// Get all suppliers
router.get('/', async (req, res) => {
    try {
        const { suppliersCollection } = await connectDB();
        const suppliers = await suppliersCollection.find({}).toArray();
        res.json(suppliers);
    } catch (err) {
        console.error("Error fetching suppliers:", err);
        res.status(500).send('Server error');
    }
});

// Add a new supplier
router.post('/', async (req, res) => {
    try {
        const { suppliersCollection } = await connectDB();
        const newSupplier = req.body;
        if (!newSupplier.name || !newSupplier.phone) {
            return res.status(400).json({ message: "Supplier name and phone are required." });
        }
        const result = await suppliersCollection.insertOne(newSupplier);
        const savedSupplier = await suppliersCollection.findOne({ _id: result.insertedId });
        res.status(201).json(savedSupplier);
    } catch (err) {
        console.error("Error adding supplier:", err);
        res.status(500).send('Server error');
    }
});

// Update a supplier
router.put('/:id', async (req, res) => {
    try {
        const { suppliersCollection } = await connectDB();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send('Invalid supplier ID');
        }
        const updatedSupplier = req.body;
        delete updatedSupplier._id;

        const result = await suppliersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedSupplier }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send('Supplier not found');
        }
        res.json({ message: 'Supplier updated successfully' });
    } catch (err) {
        console.error("Error updating supplier:", err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
