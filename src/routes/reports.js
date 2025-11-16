const express = require('express');
const router = express.Router();
const { connectDB } = require('../db');

// GET /api/reports/location-orders
router.get('/location-orders', async (req, res) => {
  try {
    const { clientsCollection, futureOrdersCollection } = await connectDB();
    const clients = await clientsCollection.find({}).toArray();
    const orders = await futureOrdersCollection.find({}).toArray();

    const locationMap = new Map();
    clients.forEach(client => {
      const district = client.district || 'Unknown';
      const state = client.state || 'Unknown';
      const key = `${district}, ${state}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { district, state, clientCount: 0, clients: [], totalOrders: 0, totalLitres: 0, resinBreakdown: {} });
      }
      const loc = locationMap.get(key);
      loc.clientCount++;
      loc.clients.push(client.name);
    });

    orders.forEach(order => {
      const client = clients.find(c => c.name === order.clientName);
      if (!client) return;
      const district = client.district || 'Unknown';
      const state = client.state || 'Unknown';
      const key = `${district}, ${state}`;
      if (locationMap.has(key)) {
        const loc = locationMap.get(key);
        loc.totalOrders++;
        loc.totalLitres += Number(order.litres) || 0;
        const resinType = order.resinType || 'Unknown';
        if (!loc.resinBreakdown[resinType]) loc.resinBreakdown[resinType] = 0;
        loc.resinBreakdown[resinType] += Number(order.litres) || 0;
      }
    });

    const report = Array.from(locationMap.values()).sort((a, b) => b.totalOrders - a.totalOrders);
    res.json(report);
  } catch (err) {
    console.error('/api/reports/location-orders GET error', err);
    res.status(500).json({ message: 'Failed to fetch location report' });
  }
});

module.exports = router;
