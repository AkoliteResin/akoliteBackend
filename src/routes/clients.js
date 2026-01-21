const express = require('express');
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

const router = express.Router();

// Get all clients
router.get('/', async (req, res) => {
  try {
    const { clientsCollection } = await connectDB();
    const clients = await clientsCollection.find({}).toArray();
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching clients' });
  }
});

// Add a new client
router.post('/', async (req, res) => {
  try {
    const { clientsCollection } = await connectDB();
    const newClient = req.body;
    delete newClient._id; // Ensure we are not trying to insert an existing _id
    const result = await clientsCollection.insertOne(newClient);
    const savedClient = await clientsCollection.findOne({ _id: result.insertedId });
    res.status(201).json(savedClient);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while adding a new client' });
  }
});

// Update a client
router.put('/:id', async (req, res) => {
  try {
    const { clientsCollection } = await connectDB();
    const { id } = req.params;
    const updatedClient = req.body;
    delete updatedClient._id; // Do not update the _id
    const result = await clientsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedClient }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.json({ message: 'Client updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while updating client' });
  }
});

// Get clients with their last order date and grouping by inactivity period
router.get('/analytics/inactive-clients', async (req, res) => {
  try {
    const { clientsCollection, futureOrdersCollection } = await connectDB();
    
    // Get all clients
    const allClients = await clientsCollection.find({}).toArray();
    
    // For each client, find their last order date
    const clientsWithOrderData = await Promise.all(
      allClients.map(async (client) => {
        const lastOrder = await futureOrdersCollection
          .findOne({ clientName: client.name }, { sort: { createdAt: -1 } });
        
        const lastOrderDate = lastOrder ? new Date(lastOrder.createdAt) : null;
        const today = new Date();
        const daysInactive = lastOrderDate 
          ? Math.floor((today - lastOrderDate) / (1000 * 60 * 60 * 24))
          : 999999; // If no order found, consider it as very inactive
        
        let inactivityCategory = '';
        if (daysInactive <= 30) {
          inactivityCategory = '0-30 days';
        } else if (daysInactive <= 60) {
          inactivityCategory = '31-60 days';
        } else if (daysInactive <= 90) {
          inactivityCategory = '61-90 days';
        } else {
          inactivityCategory = '90+ days';
        }
        
        return {
          clientName: client.name,
          phone: client.phone || '-',
          address: client.address || '-',
          lastOrderDate: lastOrderDate ? lastOrderDate.toLocaleDateString() : 'Never',
          daysInactive,
          inactivityCategory,
        };
      })
    );
    
    // Sort by days inactive (descending)
    clientsWithOrderData.sort((a, b) => b.daysInactive - a.daysInactive);
    
    res.json(clientsWithOrderData);
  } catch (err) {
    console.error('Error fetching inactive clients:', err);
    res.status(500).json({ message: 'Server error while fetching inactive clients' });
  }
});

module.exports = router;
