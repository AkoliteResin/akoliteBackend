const express = require('express');
const router = express.Router();
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

// GET all billing records
router.get('/', async (req, res) => {
  try {
    const { billingCollection } = await connectDB();
    const records = await billingCollection.find().sort({ createdAt: -1 }).toArray();
    res.json(records);
  } catch (err) {
    console.error('GET /billing error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET billing records by order numbers
router.get('/by-orders', async (req, res) => {
  try {
    const { orders } = req.query;
    if (!orders) {
      return res.json([]);
    }
    
    const orderList = orders.split(',').map(o => o.trim()).filter(Boolean);
    if (orderList.length === 0) {
      return res.json([]);
    }

    const { billingCollection } = await connectDB();
    const records = await billingCollection.find({
      'items.orderNumber': { $in: orderList }
    }).toArray();
    
    res.json(records);
  } catch (err) {
    console.error('GET /billing/by-orders error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST - Record billing as done
router.post('/done', async (req, res) => {
  const { items, totals } = req.body;
  const pass = req.headers['x-admin-pass'];

  // Verify admin password
  if (pass !== '123@Ako') {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'No items to bill' });
  }

  try {
    const { billingCollection } = await connectDB();

    // Check if any of these orders were already billed
    const orderNumbers = items.map(i => i.orderNumber).filter(Boolean);
    if (orderNumbers.length > 0) {
      const existing = await billingCollection.findOne({
        'items.orderNumber': { $in: orderNumbers }
      });
      
      if (existing) {
        const existingOrders = new Set();
        (existing.items || []).forEach(it => {
          if (it.orderNumber) existingOrders.add(it.orderNumber);
        });
        const dups = orderNumbers.filter(o => existingOrders.has(o));
        if (dups.length > 0) {
          return res.status(400).json({ 
            message: `These orders are already billed: ${dups.join(', ')}`
          });
        }
      }
    }

    // Create new billing record
    const billingRecord = {
      items,
      totals,
      createdAt: new Date(),
      billedBy: 'admin',
      status: 'completed'
    };

    const result = await billingCollection.insertOne(billingRecord);
    
    res.status(201).json({
      message: 'Billing recorded successfully',
      _id: result.insertedId,
      ...billingRecord
    });
  } catch (err) {
    console.error('POST /billing/done error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE - Delete billing record
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const pass = req.headers['x-admin-pass'];

  if (pass !== '123@Ako') {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }

  try {
    const { billingCollection } = await connectDB();
    const result = await billingCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Billing record not found' });
    }

    res.json({ message: 'Billing record deleted' });
  } catch (err) {
    console.error('DELETE /billing/:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
