const express = require('express');
const router = express.Router();
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

// GET all future orders
router.get('/', async (req, res) => {
  try {
    const { futureOrdersCollection } = await connectDB();
    const orders = await futureOrdersCollection.find().sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (err) {
    console.error('Error fetching future orders:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add new future order
router.post('/', async (req, res) => {
  const { clientName, resinType, litres, unit, scheduledDate } = req.body;

  if (!clientName || !resinType || !litres || !scheduledDate) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const { futureOrdersCollection, clientsCollection } = await connectDB();

    // Get client location (letters only, fallback to 'UNK')
    const client = await clientsCollection.findOne({ name: clientName });
    let clientLocation = client?.location || client?.address || '';
    let locationCode = (clientLocation.match(/[A-Za-z]+/g) || []).join('').substring(0, 3).toUpperCase();
    if (!locationCode) locationCode = 'UNK';

    // Format scheduled date as DDMMYYYY
    const scheduledDateObj = new Date(scheduledDate);
    const day = String(scheduledDateObj.getDate()).padStart(2, '0');
    const month = String(scheduledDateObj.getMonth() + 1).padStart(2, '0');
    const year = scheduledDateObj.getFullYear();
    const formattedDate = `${day}${month}${year}`;

    // Serial number: unique per location+date
    const dateStart = new Date(scheduledDateObj);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(scheduledDateObj);
    dateEnd.setHours(23, 59, 59, 999);
    const serialQuery = {
      scheduledDate: { $gte: dateStart, $lte: dateEnd },
      // Use locationCode in orderId
      orderId: { $regex: `^AKO-${locationCode}-${formattedDate}-` }
    };
    const countToday = await futureOrdersCollection.countDocuments(serialQuery);
    const serialNumber = String(countToday + 1).padStart(5, '0');

    // Generate order ID: AKO-LOCATION-DDMMYYYY-00001
    const orderId = `AKO-${locationCode}-${formattedDate}-${serialNumber}`;

    const newOrder = {
      clientName,
      resinType,
      litres: Number(litres),
      unit: unit || 'litres',
      scheduledDate,
      orderNumber: orderId,
      orderId,
      status: 'pending',
      createdAt: new Date(),
      fulfilledQty: 0
    };

    const result = await futureOrdersCollection.insertOne(newOrder);
    res.status(201).json({ ...newOrder, _id: result.insertedId });
  } catch (err) {
    console.error('Error adding future order:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
