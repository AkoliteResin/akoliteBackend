const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../db');
const data = require('../../data');

const router = express.Router();

// Helper: compute required materials for a resin (takes resin object directly)
function computeRequiredMaterials(resin, litres) {
  if (!resin) return null;
  
  // Handle both 'raw_materials' and 'materials' formats (static data uses 'raw_materials', DB might use 'rawMaterials')
  const materials = resin.raw_materials || resin.rawMaterials || resin.materials || [];
  
  if (!materials || materials.length === 0) return null;
  
  // For static data: materials have 'ratio' property
  // For DB data: materials have 'percentage' property
  const totalRatio = materials.reduce((sum, r) => sum + (r.ratio || r.percentage || 0), 0);
  
  if (totalRatio === 0) return null;
  
  return materials.map((r) => ({
    material: r.name,
    requiredQty: ((r.ratio || r.percentage || 0) / totalRatio) * litres,
  }));
}

// ===== SIMPLE PRODUCTION API =====

// GET all produced resins - handles both /api and /api/produced-resins
router.get('/', async (req, res) => {
  try {
    const { producedCollection } = await connectDB();
    const items = await producedCollection
      .find({ status: { $ne: 'deleted' } })
      .sort({ producedAt: -1 })
      .toArray();
    
    const result = items.map(item => ({
      ...item,
      _id: item._id.toString(),
      fromOrderId: item.fromOrderId ? item.fromOrderId.toString() : null
    }));
    
    res.json(result);
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Same endpoint with explicit /produced-resins path
router.get('/produced-resins', async (req, res) => {
  try {
    const { producedCollection } = await connectDB();
    const items = await producedCollection
      .find({ status: { $ne: 'deleted' } })
      .sort({ producedAt: -1 })
      .toArray();
    
    const result = items.map(item => ({
      ...item,
      _id: item._id.toString(),
      fromOrderId: item.fromOrderId ? item.fromOrderId.toString() : null
    }));
    
    res.json(result);
  } catch (err) {
    console.error('GET /produced-resins error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST - Produce resin (from order or manual)
router.post('/produce-resin', async (req, res) => {
  const { resinType, litres, unit, orderId } = req.body;
  if (!resinType || !litres) {
    return res.status(400).json({ message: 'Invalid input: resinType and litres required' });
  }

  try {
    const { resinsCollection, rawCollection, producedCollection, futureOrdersCollection } = await connectDB();
    
    // Check both DB and static data for resin definition
    let resin = data.find((r) => r.name === resinType);
    if (!resin) {
      // Try to find in DB
      resin = await resinsCollection.findOne({ name: resinType });
    }
    
    if (!resin) {
      return res.status(400).json({ message: `Resin type "${resinType}" not found` });
    }

    // Compute required materials using the fetched resin object
    const requiredMaterials = computeRequiredMaterials(resin, litres);
    
    if (!requiredMaterials) {
      return res.status(400).json({ message: `No materials defined for resin "${resinType}"` });
    }

    // Prevent duplicate production from same order
    if (orderId && ObjectId.isValid(orderId)) {
      const already = await producedCollection.findOne({
        fromOrderId: new ObjectId(orderId),
        status: { $ne: 'deleted' }
      });
      if (already) {
        return res.status(400).json({ message: 'This order has already been produced' });
      }
    }

    // Check raw material stock sufficiency
    const insufficient = [];
    for (const reqMat of requiredMaterials) {
      const mat = await rawCollection.findOne({ name: reqMat.material });
      if (!mat || mat.totalQuantity < reqMat.requiredQty) {
        insufficient.push(reqMat.material);
      }
    }

    if (insufficient.length > 0) {
      return res.status(400).json({
        message: `Insufficient stock: ${insufficient.join(", ")}`
      });
    }

    // Deduct raw materials from inventory
    for (const reqMat of requiredMaterials) {
      await rawCollection.updateOne(
        { name: reqMat.material },
        {
          $inc: { totalQuantity: -reqMat.requiredQty },
          $set: { updatedAt: new Date() }
        }
      );
    }

    // Fetch order details if orderId provided
    let clientNameForRecord = null;
    let orderNumberForRecord = null;
    if (orderId && ObjectId.isValid(orderId)) {
      const orderDoc = await futureOrdersCollection.findOne({ _id: new ObjectId(orderId) });
      if (orderDoc) {
        clientNameForRecord = orderDoc.clientName;
        orderNumberForRecord = orderDoc.orderNumber;
        // Update order status to in_progress
        await futureOrdersCollection.updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { status: 'in_progress', updatedAt: new Date() } }
        );
      }
    }

    const now = new Date();
    const doc = {
      resinType,
      litres: Number(litres),
      unit: unit || 'litres',
      producedAt: now,
      materialsUsed: requiredMaterials,
      status: 'pending',
      clientName: clientNameForRecord,
      fromOrderId: orderId && ObjectId.isValid(orderId) ? new ObjectId(orderId) : null,
      orderNumber: orderNumberForRecord,
      createdAt: now
    };

    const result = await producedCollection.insertOne(doc);

    res.status(201).json({
      message: `Produced ${litres} ${unit || 'litres'} of ${resinType}`,
      _id: result.insertedId,
      requiredMaterials
    });
  } catch (err) {
    console.error('POST /produce-resin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT - Update production status - handles both /api/:id and /api/produced-resins/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    const { producedCollection } = await connectDB();
    const result = await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Production record not found' });
    }

    res.json({ message: `Status updated to ${status}` });
  } catch (err) {
    console.error('PUT /:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE - Mark production as deleted (soft delete) - handles both /api/:id and /api/produced-resins/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }

  try {
    const { producedCollection, rawCollection } = await connectDB();
    const production = await producedCollection.findOne({ _id: new ObjectId(id) });

    if (!production) {
      return res.status(404).json({ message: 'Production record not found' });
    }

    // Return materials to inventory if deleting
    if (production.materialsUsed && production.materialsUsed.length > 0) {
      for (const mat of production.materialsUsed) {
        await rawCollection.updateOne(
          { name: mat.material },
          {
            $inc: { totalQuantity: mat.requiredQty },
            $set: { updatedAt: new Date() }
          }
        );
      }
    }

    await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'deleted', updatedAt: new Date() } }
    );

    res.json({ message: 'Production record deleted and materials returned' });
  } catch (err) {
    console.error('DELETE /:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== EXPLICIT /produced-resins/:id ROUTES (for frontend compatibility) =====

// PUT /produced-resins/:id - Update status
router.put('/produced-resins/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    const { producedCollection } = await connectDB();
    const result = await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Production record not found' });
    }

    res.json({ message: `Status updated to ${status}` });
  } catch (err) {
    console.error('PUT /produced-resins/:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /produced-resins/:id - Delete production
router.delete('/produced-resins/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }

  try {
    const { producedCollection, rawCollection } = await connectDB();
    const production = await producedCollection.findOne({ _id: new ObjectId(id) });

    if (!production) {
      return res.status(404).json({ message: 'Production record not found' });
    }

    // Return materials to inventory if deleting
    if (production.materialsUsed && production.materialsUsed.length > 0) {
      for (const mat of production.materialsUsed) {
        await rawCollection.updateOne(
          { name: mat.material },
          {
            $inc: { totalQuantity: mat.requiredQty },
            $set: { updatedAt: new Date() }
          }
        );
      }
    }

    await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'deleted', updatedAt: new Date() } }
    );

    res.json({ message: 'Production record deleted and materials returned' });
  } catch (err) {
    console.error('DELETE /produced-resins/:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /produced-resins/:id/deploy - Deploy (dispatch) production to clients
router.post('/:id/deploy', async (req, res) => {
  const { id } = req.params;
  const { dispatchQuantity } = req.body;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }

  try {
    const { producedCollection } = await connectDB();
    const production = await producedCollection.findOne({ _id: new ObjectId(id) });

    if (!production) {
      return res.status(404).json({ message: 'Production record not found' });
    }

    if (production.status !== 'done') {
      return res.status(400).json({ message: 'Production must be marked as Done before deployment' });
    }

    const availableQty = Number(production.litres) || 0;
    const deployQty = Number(dispatchQuantity) || availableQty;

    if (deployQty <= 0 || deployQty > availableQty) {
      return res.status(400).json({ message: `Invalid dispatch quantity: ${deployQty}` });
    }

    // If full dispatch, mark as deployed
    if (deployQty === availableQty) {
      await producedCollection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            status: 'deployed',
            deployedAt: new Date(),
            dispatchedQuantity: deployQty,
            updatedAt: new Date()
          }
        }
      );
      res.json({ message: `Production dispatched: ${deployQty} ${production.unit || 'litres'}` });
    } else {
      // Partial dispatch: create a new record for godown (remaining qty) and mark original as deployed
      const godownRecord = {
        resinType: production.resinType,
        litres: availableQty - deployQty,
        unit: production.unit || 'litres',
        producedAt: production.producedAt,
        materialsUsed: production.materialsUsed,
        status: 'deployed',
        clientName: 'Godown',
        orderNumber: production.orderNumber ? `${production.orderNumber}-G` : null,
        fromOrderId: production.fromOrderId,
        deployedAt: new Date(),
        createdAt: new Date()
      };

      await producedCollection.insertOne(godownRecord);

      // Mark original as fully deployed
      await producedCollection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            status: 'deployed',
            litres: deployQty,
            deployedAt: new Date(),
            dispatchedQuantity: deployQty,
            updatedAt: new Date()
          }
        }
      );

      res.json({ 
        message: `Production dispatched: ${deployQty} ${production.unit || 'litres'} to client, ${availableQty - deployQty} moved to Godown` 
      });
    }
  } catch (err) {
    console.error('POST /:id/deploy error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== NEW ENDPOINT: Get all dispatched orders grouped by resin =====
router.get('/dispatched/all', async (req, res) => {
  try {
    const { producedCollection, futureOrdersCollection } = await connectDB();
    
    // Get ALL dispatched items - fetch items that:
    // 1. Have a clientName (excluding null, empty, or Godown) - these are items sent to actual clients
    // 2. Exclude items that are in pending/in_process/deleted states
    const dispatchedItems = await producedCollection
      .find({ 
        clientName: { $exists: true, $ne: null, $ne: '', $ne: 'Godown' },
        status: { $nin: ['pending', 'in_process', 'deleted'] }
      })
      .sort({ deployedAt: -1, updatedAt: -1, createdAt: -1 })
      .toArray();
    
    // Debug: log first item to see available fields
    if (dispatchedItems.length > 0) {
      console.log('Sample dispatched item fields:', Object.keys(dispatchedItems[0]));
      console.log('Sample item:', JSON.stringify(dispatchedItems[0], null, 2));
    }
    
    // Group by resin type and aggregate data
    const groupedByResin = new Map();
    
    for (const item of dispatchedItems) {
      const resinType = item.resinType || 'Unknown Resin';
      
      if (!groupedByResin.has(resinType)) {
        groupedByResin.set(resinType, {
          resinType,
          totalProduced: 0,
          totalProducedUnit: item.unit || 'litres',
          clients: new Map(),
          orders: []
        });
      }
      
      const resinGroup = groupedByResin.get(resinType);
      resinGroup.totalProduced += Number(item.litres) || 0;
      
      // Get order details if available
      let orderDetails = {
        clientName: item.clientName || 'Unknown',
        orderedQty: Number(item.litres) || 0,
        unit: item.unit || 'litres',
        orderedTime: item.orderedTime || item.createdAt || null,
        dispatchTime: item.deployedAt || item.dispatchedAt || item.updatedAt || item.createdAt || null,
        dispatchedQty: Number(item.litres) || 0,
        producedAt: item.producedAt || null,
        fromOrderId: item.fromOrderId ? item.fromOrderId.toString() : null,
        orderNumber: item.orderNumber,
        _id: item._id.toString()
      };
      
      resinGroup.orders.push(orderDetails);
      
      // Track unique clients
      if (!resinGroup.clients.has(item.clientName)) {
        resinGroup.clients.set(item.clientName, {
          clientName: item.clientName,
          totalDispatched: 0,
          unit: item.unit || 'litres'
        });
      }
      resinGroup.clients.get(item.clientName).totalDispatched += Number(item.litres) || 0;
    }
    
    // Convert Map to array and organize clients
    const result = Array.from(groupedByResin.values()).map(group => ({
      resinType: group.resinType,
      totalProduced: group.totalProduced,
      totalProducedUnit: group.totalProducedUnit,
      clients: Array.from(group.clients.values()).sort((a, b) => 
        b.totalDispatched - a.totalDispatched
      ),
      orders: group.orders.sort((a, b) => 
        new Date(b.dispatchTime) - new Date(a.dispatchTime)
      ),
      orderCount: group.orders.length
    }));
    
    res.json({ 
      success: true, 
      data: result,
      totalResins: result.length,
      totalOrders: dispatchedItems.length
    });
  } catch (err) {
    console.error('GET /dispatched/all error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router;
