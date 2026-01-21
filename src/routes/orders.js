const express = require('express');
const router = express.Router();
const { connectDB } = require('../db');

/**
 * GET all future orders
 */
router.get('/', async (req, res) => {
  try {
    const { futureOrdersCollection } = await connectDB();

    const orders = await futureOrdersCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST create future order
 */
router.post('/', async (req, res) => {
  const { clientName, resinType, litres, unit, scheduledDate } = req.body;

  if (!clientName || !resinType || !litres || !scheduledDate) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const { db, futureOrdersCollection, clientsCollection } =
      await connectDB();

    // --------------------
    // Case-insensitive client lookup (FIX)
    // --------------------
    let client = await clientsCollection.findOne({
      name: { $regex: `^${clientName.trim()}$`, $options: 'i' }
    });
    console.log('ORDER DEBUG: clientName from request:', clientName);
    console.log('ORDER DEBUG: client lookup result:', client);
    console.log('ORDER DEBUG: Request body:', JSON.stringify(req.body));

    // Create default Godown if it doesn't exist
    if (!client && clientName.toLowerCase() === 'godown') {
      const newGodown = {
        name: 'Godown',
        phone: '-',
        address: 'Default',
        district: 'Default',
        state: 'Default',
        email: '',
        company: 'Godown',
        gst: ''
      };
      const result = await clientsCollection.insertOne(newGodown);
      client = { ...newGodown, _id: result.insertedId };
      console.log('ORDER DEBUG: Created default Godown:', client);
    }

    let rawLocation = '';
    if (client) {
      rawLocation = client.district || client.location || client.state || '';
    }
    console.log('ORDER DEBUG: extracted rawLocation:', rawLocation);

    let locationCode = '';
    if (rawLocation) {
      locationCode = rawLocation.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    }
    console.log('ORDER DEBUG: final locationCode:', locationCode);

    if (!client) {
      return res.status(400).json({ message: 'Client not found' });
    }
    if (!rawLocation) {
      return res.status(400).json({ message: 'Client location missing' });
    }

    // --------------------
    // Normalize date
    // --------------------
    const scheduledDateObj = new Date(scheduledDate);
    if (isNaN(scheduledDateObj)) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const day = String(scheduledDateObj.getDate()).padStart(2, '0');
    const month = String(scheduledDateObj.getMonth() + 1).padStart(2, '0');
    const year = scheduledDateObj.getFullYear();
    const formattedDate = `${day}${month}${year}`;

    // --------------------
    // Atomic counter (NO DUPLICATES)
    // --------------------
    const counterKey = `AKO-${locationCode}-${formattedDate}`;

    const counterResult = await db
      .collection('counters')
      .findOneAndUpdate(
        { _id: counterKey },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );

    const counter = counterResult.value || counterResult;
    const serial = String(counter.seq).padStart(6, '0');
    const orderId = `${counterKey}-${serial}`;

    // --------------------
    // Insert order
    // --------------------
    const newOrder = {
      clientName: client.name,
      resinType,
      litres: Number(litres),
      unit: unit || 'litres',
      scheduledDate: scheduledDateObj,
      orderId,
      orderNumber: orderId,
      status: 'pending',
      fulfilledQty: 0,
      createdAt: new Date()
    };

    const result = await futureOrdersCollection.insertOne(newOrder);

    res.status(201).json({
      ...newOrder,
      _id: result.insertedId
    });
  } catch (err) {
    console.error('POST /api/future-orders ERROR:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
