const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../db');
const data = require('../../data');

const router = express.Router();

// Simple admin password check for destructive actions (kept local to this router)
const ADMIN_PASS = '123@Ako';
function requireAdminPassword(req, res) {
  const provided = req.headers['x-admin-pass'];
  if (!provided || provided !== ADMIN_PASS) {
    res.status(401).json({ message: 'Unauthorized: invalid admin password' });
    return false;
  }
  return true;
}

// Helper: get resin definition by name
function getResinDef(resinType) {
  return data.find((r) => r.name === resinType);
}

// Helper: compute required materials for a resin and total litres
function computeRequiredMaterials(resinType, litres) {
  const resin = getResinDef(resinType);
  if (!resin) return null;
  const totalRatio = resin.raw_materials.reduce((sum, r) => sum + r.ratio, 0);
  return resin.raw_materials.map((r) => ({
    material: r.name,
    requiredQty: (r.ratio / totalRatio) * Number(litres),
  }));
}

// Helper: Auto-batch orders for a specific date and resin type
async function autoBatchOrders(scheduledDate, resinType, producedCollection, futureOrdersCollection, batchSettingsCollection) {
  const setting = batchSettingsCollection ? await batchSettingsCollection.findOne({ resinType }) : null;
  const BATCH_CAP = setting && Number(setting.capacity) > 0 ? Number(setting.capacity) : 5000;

  // 1) Find any existing PENDING batches for this date/resin
  const pendingBatches = await producedCollection
    .find({ isBatch: true, resinType, scheduledDate, status: 'pending' })
    .project({ _id: 1 })
    .toArray();
  const pendingBatchIds = pendingBatches.map(b => b._id.toString());

  // 2) For orders pointing to those pending batches, clear batchId and move back to pending
  if (pendingBatchIds.length > 0) {
    await futureOrdersCollection.updateMany(
      { batchId: { $in: pendingBatchIds } },
      { $unset: { batchId: "", batchedAt: "" }, $set: { status: 'pending' } }
    );
  }

  // 3) Remove those pending batches so we can rebuild cleanly
  if (pendingBatchIds.length > 0) {
    await producedCollection.deleteMany({ _id: { $in: pendingBatches.map(b => b._id) } });
  }

  // 3b) Recover any orphaned 'batched' orders that reference non-existent batches for this date/resin
  const existingBatchIds = await producedCollection
    .find({ isBatch: true, resinType, scheduledDate })
    .project({ _id: 1 })
    .toArray();
  const existingIdSet = new Set(existingBatchIds.map(x => x._id.toString()));
  await futureOrdersCollection.updateMany(
    { scheduledDate, resinType, status: 'batched', batchId: { $exists: true, $ne: null, $nin: Array.from(existingIdSet) } },
    { $unset: { batchId: "", batchedAt: "" }, $set: { status: 'pending' } }
  );

  // 4) Fetch all orders still pending/in_progress/partially_dispatched
  const orders = await futureOrdersCollection
    .find({ scheduledDate, resinType, status: { $in: ['pending', 'in_progress', 'partially_dispatched'] } })
    .sort({ createdAt: 1 })
    .toArray();

  if (orders.length === 0) return;

  // 5) Determine starting batch index for numbering
  const existingCount = await producedCollection.countDocuments({ isBatch: true, resinType, scheduledDate });
  let batchIndex = existingCount;
  
  let currentAlloc = [];
  let currentTotal = 0;
  const createdBatches = [];
  
  const flushBatch = async () => {
    if (currentAlloc.length === 0) return;
    batchIndex += 1;
    const batchNumber = `BT-${scheduledDate.replace(/-/g, '')}-${String(batchIndex).padStart(5, '0')}`;
    
    const doc = {
      isBatch: true,
      batchNumber,
      resinType,
      litres: currentTotal,
      unit: 'litres',
      producedAt: new Date(),
      status: 'pending',
      scheduledDate,
      allocations: currentAlloc.map((a, idx) => {
        const clientSeq = idx + 1;
        return {
          orderId: a.orderId,
          clientName: a.clientName,
          litres: a.litres,
          unit: a.unit,
          orderNumber: a.orderNumber,
          clientSeq,
          suffix: `C${clientSeq}`,
          displayOrderNumber: `${a.orderNumber}C${clientSeq}`
        };
      })
    };
    
    const ins = await producedCollection.insertOne(doc);
    const batchId = ins.insertedId;
    
    // Mark orders with their batchId
    const orderIds = currentAlloc.map(a => new ObjectId(a.orderId));
    if (orderIds.length > 0) {
      await futureOrdersCollection.updateMany(
        { _id: { $in: orderIds } },
        { $set: { status: 'batched', batchedAt: new Date(), batchId: batchId.toString() } }
      );
    }
    
    createdBatches.push({ _id: batchId.toString(), batchNumber });
    currentAlloc = [];
    currentTotal = 0;
  };
  
  for (const order of orders) {
    // Only batch the remaining quantity if some part was already dispatched
    let remaining = Math.max(0, Number(order.litres) - Number(order.fulfilledQty || 0));
    if (remaining <= 0) continue;
    // Assign full order to batches, may span multiple if > capacity
    while (remaining > 0) {
      const available = BATCH_CAP - currentTotal;
      if (available <= 0) {
        await flushBatch();
        continue;
      }
      const take = Math.min(remaining, available);
      currentAlloc.push({
        orderId: order._id.toString(),
        clientName: order.clientName,
        litres: take,
        unit: order.unit || 'litres',
        orderNumber: order.orderNumber,
      });
      currentTotal += take;
      remaining -= take;
      
      if (currentTotal >= BATCH_CAP - 1e-9) {
        await flushBatch();
      }
    }
  }
  
  // Flush final partial batch
  await flushBatch();
  
  return createdBatches;
}


// ---------------- Resin Production API ----------------

// Produce resin (manual or from an order)
router.post('/produce-resin', async (req, res) => {
  const { resinType, litres, unit, orderId } = req.body;
  if (!resinType || !litres) return res.status(400).json({ message: 'Invalid input' });

  const resin = data.find((r) => r.name === resinType);
  if (!resin) return res.status(400).json({ message: `Resin type "${resinType}" not found` });

  const totalRatio = resin.raw_materials.reduce((sum, r) => sum + r.ratio, 0);

  // calculate required quantity for each raw material
  const requiredMaterials = resin.raw_materials.map((r) => ({
    material: r.name,
    requiredQty: (r.ratio / totalRatio) * litres,
  }));

  try {
    const { rawCollection, producedCollection, futureOrdersCollection, batchSettingsCollection } = await connectDB();
    // If this is tied to an order, ensure it's not produced already (prevent duplicates)
    let orderDoc = null;
    if (orderId && ObjectId.isValid(orderId)) {
      const already = await producedCollection.findOne({ fromOrderId: new ObjectId(orderId), status: { $ne: 'deleted' } });
      if (already) {
        return res.status(400).json({ message: 'This order has already been produced' });
      }
      orderDoc = await futureOrdersCollection.findOne({ _id: new ObjectId(orderId) });
      if (!orderDoc) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // If this order is already part of a PENDING batch, un-batch it so the user can produce now from Calculator.
      if (orderDoc.batchId) {
        const batchIdStr = String(orderDoc.batchId);
        // Find all pending batches on same date/resin that include this order allocation (covers edge case of splits)
        const affectedBatches = await producedCollection
          .find({
            isBatch: true,
            resinType: orderDoc.resinType,
            scheduledDate: orderDoc.scheduledDate,
            status: 'pending',
            'allocations.orderId': orderDoc._id.toString()
          })
          .toArray();

        if (affectedBatches.length === 0) {
          // If batch exists but not pending (in_process/done), block to avoid inconsistency
          const hardBatch = ObjectId.isValid(batchIdStr)
            ? await producedCollection.findOne({ _id: new ObjectId(batchIdStr), isBatch: true })
            : null;
          if (hardBatch && hardBatch.status !== 'pending') {
            return res.status(409).json({ message: 'This order is already assigned to a batch in process. Use batch actions to proceed/complete/dispatch.' });
          }
        } else {
          // Remove this order from all affected pending batches and recalc litres + resequence allocations
          for (const b of affectedBatches) {
            const newAllocs = (b.allocations || []).filter(a => String(a.orderId) !== orderDoc._id.toString());
            if (newAllocs.length === 0) {
              await producedCollection.deleteOne({ _id: b._id });
              continue;
            }
            // resequence and rebuild displayOrderNumbers
            const resequenced = newAllocs.map((a, idx) => ({
              ...a,
              clientSeq: idx + 1,
              suffix: `C${idx + 1}`,
              displayOrderNumber: a.orderNumber ? `${a.orderNumber}C${idx + 1}` : a.displayOrderNumber
            }));
            const newTotal = resequenced.reduce((sum, a) => sum + Number(a.litres || 0), 0);
            await producedCollection.updateOne(
              { _id: b._id },
              { $set: { allocations: resequenced, litres: newTotal } }
            );
          }

          // Unset batchId on the order
          await futureOrdersCollection.updateOne(
            { _id: orderDoc._id },
            { $unset: { batchId: "", batchedAt: "" }, $set: { status: 'pending' } }
          );

          // Optionally, re-pack pending orders into batches for the same date/resin
          await autoBatchOrders(orderDoc.scheduledDate, orderDoc.resinType, producedCollection, futureOrdersCollection, batchSettingsCollection);
        }
      }
    }
    const insufficient = [];

    // Check if enough stock
    for (const reqMat of requiredMaterials) {
      const mat = await rawCollection.findOne({ name: reqMat.material });
      if (!mat || mat.totalQuantity < reqMat.requiredQty) {
        insufficient.push(reqMat.material);
      }
    }

    if (insufficient.length > 0) {
      return res.status(400).json({
        message: `Cannot produce resin. Insufficient stock: ${insufficient.join(", ")}`,
      });
    }

    // Subtract raw materials
    for (const reqMat of requiredMaterials) {
      await rawCollection.updateOne(
        { name: reqMat.material },
        { $inc: { totalQuantity: -reqMat.requiredQty }, $set: { updatedAt: new Date() } }
      );
    }

    // If coming from an order, fetch clientName and orderNumber
    let clientNameForRecord = null;
    let orderNumberForRecord = null;
    if (orderId && ObjectId.isValid(orderId)) {
      const orderDoc = await futureOrdersCollection.findOne({ _id: new ObjectId(orderId) });
      if (orderDoc) {
        if (orderDoc.clientName) clientNameForRecord = orderDoc.clientName;
        if (orderDoc.orderNumber) orderNumberForRecord = orderDoc.orderNumber;
      }
    }

    const now = new Date();

    if (orderId && ObjectId.isValid(orderId)) {
      // For produce-from-order: create a pending record in Active Orders
      await producedCollection.insertOne({
        resinType,
        litres: Number(litres),
        unit: unit || 'litres',
        producedAt: now,
        materialsUsed: requiredMaterials,
        status: 'pending',
        clientName: clientNameForRecord,
        fromOrderId: new ObjectId(orderId),
        orderNumber: orderNumberForRecord || null
      });

      // Update the order to in_progress now that production has started
      await futureOrdersCollection.updateOne(
        { _id: new ObjectId(orderId) },
        { $set: { status: 'in_progress', updatedAt: now } }
      );

      return res.json({
        message: `Produced ${litres} ${unit || 'litres'} of ${resinType} for order ${orderNumberForRecord || ''}`,
        requiredMaterials,
        movedTo: 'active'
      });
    }

    // Manual production: Save as pending
    await producedCollection.insertOne({
      resinType,
      litres: Number(litres),
      unit: unit || 'litres',
      producedAt: now,
      materialsUsed: requiredMaterials,
      status: 'pending',
      clientName: clientNameForRecord,
      fromOrderId: null,
      orderNumber: null
    });

    res.json({
      message: `Produced ${litres} ${unit || 'litres'} of ${resinType}`,
      requiredMaterials
    });
  } catch (err) {
    console.error('POST /produce-resin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get produced resins list
router.get('/produced-resins', async (req, res) => {
  try {
    const { producedCollection } = await connectDB();
    const producedList = await producedCollection.find().sort({ producedAt: -1 }).toArray();
    
    const safeList = producedList.map(resin => ({
      ...resin,
      _id: resin._id.toString(),
      producedAt: resin.producedAt ? new Date(resin.producedAt).toISOString() : null,
      proceededAt: resin.proceededAt ? new Date(resin.proceededAt).toISOString() : null,
      completedAt: resin.completedAt ? new Date(resin.completedAt).toISOString() : null,
      deployedAt: resin.deployedAt ? new Date(resin.deployedAt).toISOString() : null,
      deletedAt: resin.deletedAt ? new Date(resin.deletedAt).toISOString() : null,
      status: resin.status || 'pending',
      fromOrderId: resin.fromOrderId ? resin.fromOrderId.toString() : null
    }));

    res.json({
      items: safeList,
      total: safeList.length
    });
  } catch (err) {
    console.error('GET /produced-resins error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch produced resins',
      error: err.message 
    });
  }
});


// Mark resin as in-process (proceed)
router.post('/produced-resins/:id/proceed', async (req, res) => {
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const { producedCollection } = await connectDB();
    const result = await producedCollection.findOneAndUpdate(
      { _id: new ObjectId(id), status: { $nin: ['deleted', 'deployed'] } },
      { $set: { status: 'in_process', proceededAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ message: 'Production not found or cannot be proceeded' });
    const updated = result.value;
    updated._id = updated._id.toString();
    res.json({ message: 'Production moved to in process', production: updated });
  } catch (err) {
    console.error('/proceed error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Mark resin as completed (done)
router.post('/produced-resins/:id/complete', async (req, res) => {
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const { producedCollection, rawCollection } = await connectDB();

    // Load the production record first
    const production = await producedCollection.findOne({ _id: new ObjectId(id), status: { $nin: ['deleted', 'deployed'] } });
    if (!production) return res.status(404).json({ message: 'Production not found or cannot be completed' });

    // If materialsUsed not present, this is likely a batch (or manual record). Deduct stock now.
    if (!production.materialsUsed || production.materialsUsed.length === 0) {
      const requiredMaterials = computeRequiredMaterials(production.resinType, production.litres);
      if (!requiredMaterials) return res.status(400).json({ message: `Resin type "${production.resinType}" not found` });

      // Check stock sufficiency
      const insufficient = [];
      for (const reqMat of requiredMaterials) {
        const mat = await rawCollection.findOne({ name: reqMat.material });
        if (!mat || mat.totalQuantity < reqMat.requiredQty) insufficient.push(reqMat.material);
      }
      if (insufficient.length > 0) {
        return res.status(400).json({ message: `Cannot complete production. Insufficient stock: ${insufficient.join(', ')}` });
      }

      // Deduct stock
      for (const reqMat of requiredMaterials) {
        await rawCollection.updateOne(
          { name: reqMat.material },
          { $inc: { totalQuantity: -reqMat.requiredQty }, $set: { updatedAt: new Date() } }
        );
      }

      // Update production with materialsUsed info
      await producedCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { materialsUsed: requiredMaterials, stockDeductedAt: new Date() } }
      );
    }

    const result = await producedCollection.findOneAndUpdate(
      { _id: new ObjectId(id), status: { $nin: ['deleted', 'deployed'] } },
      { $set: { status: 'done', completedAt: new Date() } },
      { returnDocument: 'after' }
    );
    const updated = result.value;
    updated._id = updated._id.toString();
    res.json({ message: 'Production marked as done', production: updated });
  } catch (err) {
    console.error('/complete error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Deploy production (with partial dispatch support)
router.post('/produced-resins/:id/deploy', async (req, res) => {
  const { id } = req.params;
  const { dispatchQuantity } = req.body;
  
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  if (!dispatchQuantity || dispatchQuantity <= 0) return res.status(400).json({ message: 'Invalid dispatch quantity' });
  
  try {
    const { producedCollection, futureOrdersCollection } = await connectDB();
    
    // Find the production record
    const production = await producedCollection.findOne({ 
      _id: new ObjectId(id), 
      status: { $nin: ['deleted', 'deployed'] } 
    });
    
    if (!production) return res.status(404).json({ message: 'Production not found or cannot be deployed' });
    
    const availableQty = production.litres;
    const unit = production.unit || 'litres';
    
    if (dispatchQuantity > availableQty) {
      return res.status(400).json({ message: `Cannot dispatch more than available (${availableQty} ${unit})` });
    }
    
    const deployTime = new Date();
    const remainingQty = availableQty - dispatchQuantity;
  const baseOrderNumber = production.orderNumber || null;
    
    // Create deployed record with dispatched quantity
    const deployedRecord = {
      resinType: production.resinType,
      litres: dispatchQuantity,
      unit: unit,
      producedAt: production.producedAt,
      materialsUsed: production.materialsUsed.map(m => ({
        material: m.material,
        requiredQty: (m.requiredQty / availableQty) * dispatchQuantity
      })),
      status: 'deployed',
      deployedAt: deployTime,
      clientName: production.clientName,
      fromOrderId: production.fromOrderId,
      originalProductionId: production._id,
      // Append S1 only when there is a split (i.e., some remainder goes to Godown)
      orderNumber: baseOrderNumber ? (remainingQty > 0 ? `${baseOrderNumber}S1` : baseOrderNumber) : null,
      fromSplit: remainingQty > 0
    };
    
    await producedCollection.insertOne(deployedRecord);
    
    // If there's remaining quantity, create a Godown record
    if (remainingQty > 0) {
      const godownRecord = {
        resinType: production.resinType,
        litres: remainingQty,
        unit: unit,
        producedAt: production.producedAt,
        materialsUsed: production.materialsUsed.map(m => ({
          material: m.material,
          requiredQty: (m.requiredQty / availableQty) * remainingQty
        })),
        status: 'deployed',
        deployedAt: deployTime,
        clientName: 'Godown',
        fromOrderId: production.fromOrderId,
        originalProductionId: production._id,
        orderNumber: baseOrderNumber ? `${baseOrderNumber}S2` : null,
        fromSplit: true
      };
      
      await producedCollection.insertOne(godownRecord);
    }
    
    // Mark original record as deployed (archived)
    await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status: 'deployed', 
          deployedAt: deployTime,
          splitInto: remainingQty > 0 ? 'client+godown' : 'client-only'
        } 
      }
    );
    
    // Update future order fulfillment if this production came from an order
    if (production.fromOrderId && ObjectId.isValid(production.fromOrderId)) {
      const order = await futureOrdersCollection.findOne({ _id: new ObjectId(production.fromOrderId) });
      if (order) {
        const fulfilledQty = (Number(order.fulfilledQty) || 0) + Number(dispatchQuantity);
        const totalQty = Number(order.litres);
        if (fulfilledQty >= totalQty - 1e-9) {
          await futureOrdersCollection.updateOne(
            { _id: order._id },
            { $set: { status: 'completed', completedAt: deployTime, fulfilledQty: totalQty } }
          );
        } else {
          await futureOrdersCollection.updateOne(
            { _id: order._id },
            { $set: { status: 'partially_dispatched', updatedAt: deployTime, fulfilledQty } }
          );
        }
      }
    }

    res.json({ 
      message: 'Production deployed successfully',
      dispatched: dispatchQuantity,
      toGodown: remainingQty,
      unit: unit
    });
  } catch (err) {
    console.error('/deploy error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Delete production and return materials to stock
router.delete('/produced-resins/:id', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const { producedCollection, rawCollection } = await connectDB();
    const production = await producedCollection.findOne({ _id: new ObjectId(id) });
    if (!production) return res.status(404).json({ message: 'Production not found' });
    if (production.status === 'deleted') return res.status(400).json({ message: 'Already deleted' });
    if (production.status === 'deployed') return res.status(400).json({ message: 'Cannot delete deployed production' });

    // Return materials
    const ops = (production.materialsUsed || []).map(mat => ({
      updateOne: {
        filter: { name: mat.material },
        update: { $inc: { totalQuantity: mat.requiredQty }, $set: { updatedAt: new Date() } }
      }
    }));
    if (ops.length > 0) await rawCollection.bulkWrite(ops);

    await producedCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: 'deleted', deletedAt: new Date() } });
    res.json({ message: 'Production deleted and materials returned' });
  } catch (err) {
    console.error('/delete error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
