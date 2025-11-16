const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const data = require("./data"); // your resin definitions

// DB and modular routers
const { connectDB } = require('./src/db');
const clientsRouter = require('./src/routes/clients');
const reportsRouter = require('./src/routes/reports');
const producedResinsRouter = require('./src/routes/producedResins');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Mount modular routers
app.use('/api/clients', clientsRouter);
app.use('/api/reports', reportsRouter);
// produce/resins routes (moved to router)
app.use('/api', producedResinsRouter);

// Simple admin password check for destructive actions
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

// Helper: Generate order number DDMMYYYYHHMM
function generateOrderNumber(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${dd}${mm}${yyyy}${hh}${min}${ss}`; // DDMMYYYYHHMMSS
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
  //    (and any previously-batched orders were reset above)
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


// connectDB moved to src/db.js — use require('./src/db').connectDB

// ---------------- Raw Materials APIs ----------------


// GET all raw materials
app.get("/api/raw-materials", async (req, res) => {
  try {
    const { rawCollection } = await connectDB();
    const materials = await rawCollection.find().toArray();
    res.json(materials);
  } catch (err) {
    console.error("GET /raw-materials error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// Add stock
app.post("/api/raw-materials/add", async (req, res) => {
  const { name, quantity } = req.body;
  if (!name || quantity == null) return res.status(400).json({ message: "Invalid input" });


  try {
    const { rawCollection } = await connectDB();
    await rawCollection.updateOne(
      { name },
      { $inc: { totalQuantity: quantity }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ message: "Quantity added successfully" });
  } catch (err) {
    console.error("POST /raw-materials/add error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// Modify total quantity
app.put("/api/raw-materials/modify", async (req, res) => {
  const { name, newQuantity } = req.body;
  if (!name || newQuantity == null) return res.status(400).json({ message: "Invalid input" });


  try {
    const { rawCollection } = await connectDB();
    await rawCollection.updateOne(
      { name },
      { $set: { totalQuantity: newQuantity, updatedAt: new Date() } }
    );
    res.json({ message: "Quantity modified successfully" });
  } catch (err) {
    console.error("PUT /raw-materials/modify error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// Resin production routes were moved to src/routes/producedResins.js

// ---------------- Batch Settings API ----------------

// Get all batch capacities
app.get('/api/batch-settings', async (req, res) => {
  try {
    const { batchSettingsCollection } = await connectDB();
    const docs = await batchSettingsCollection.find().toArray();
    res.json(docs.map(d => ({ resinType: d.resinType, capacity: Number(d.capacity) || 0 })));
  } catch (err) {
    console.error('/api/batch-settings GET error', err);
    res.status(500).json({ message: 'Failed to fetch batch settings' });
  }
});

// Set capacity for a resin type
app.put('/api/batch-settings/:resinType', async (req, res) => {
  const { resinType } = req.params;
  const { capacity } = req.body || {};
  if (!resinType) return res.status(400).json({ message: 'resinType is required' });
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) {
    return res.status(400).json({ message: 'capacity must be a positive number' });
  }
  try {
    const { batchSettingsCollection } = await connectDB();
    await batchSettingsCollection.updateOne(
      { resinType },
      { $set: { resinType, capacity: cap, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ message: 'Capacity saved', resinType, capacity: cap });
  } catch (err) {
    console.error('/api/batch-settings PUT error', err);
    res.status(500).json({ message: 'Failed to save batch setting' });
  }
});

// ---------------- Batch Production APIs ----------------

// Generate FIFO batches (capacity 5000 litres) for a given scheduledDate across all resins
app.post('/api/batches/generate', async (req, res) => {
  const { scheduledDate } = req.body || {};
  if (!scheduledDate) return res.status(400).json({ message: 'scheduledDate is required (YYYY-MM-DD)' });

  try {
    const { futureOrdersCollection, producedCollection, batchSettingsCollection } = await connectDB();
    
    // Get all resin types with orders on this date
    const resinTypes = await futureOrdersCollection.distinct('resinType', { 
      scheduledDate, 
      status: { $in: ['pending', 'in_progress', 'batched'] } 
    });
    
    const allBatches = [];
    for (const resinType of resinTypes) {
      const batches = await autoBatchOrders(scheduledDate, resinType, producedCollection, futureOrdersCollection, batchSettingsCollection);
      if (batches) allBatches.push(...batches);
    }

    res.json({ message: 'Batches generated', batches: allBatches });
  } catch (err) {
    console.error('/api/batches/generate error', err);
    res.status(500).json({ message: 'Failed to generate batches', error: err.message });
  }
});

// Re-batch a specific resin type on a specific date
app.post('/api/batches/rebatch', async (req, res) => {
  const { scheduledDate, resinType } = req.body || {};
  if (!scheduledDate || !resinType) {
    return res.status(400).json({ message: 'scheduledDate and resinType are required' });
  }

  try {
    const { futureOrdersCollection, producedCollection, batchSettingsCollection } = await connectDB();
    const batches = await autoBatchOrders(scheduledDate, resinType, producedCollection, futureOrdersCollection, batchSettingsCollection);
    res.json({ message: `Re-batched ${resinType} for ${scheduledDate}`, batches: batches || [] });
  } catch (err) {
    console.error('/api/batches/rebatch error', err);
    res.status(500).json({ message: 'Failed to re-batch', error: err.message });
  }
});

// Dispatch a completed batch to its client allocations
app.post('/api/batches/:id/dispatch', async (req, res) => {
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid batch id' });
  try {
    const { producedCollection, futureOrdersCollection } = await connectDB();
    const batch = await producedCollection.findOne({ _id: new ObjectId(id) });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (!batch.isBatch) return res.status(400).json({ message: 'Not a batch record' });
    if (batch.status !== 'done') return res.status(400).json({ message: 'Batch must be completed before dispatch' });
    const allocations = Array.isArray(batch.allocations) ? batch.allocations : [];
    if (allocations.length === 0) return res.status(400).json({ message: 'No allocations found in batch' });

    const now = new Date();
    const totalLitres = Number(batch.litres);
    const unit = batch.unit || 'litres';

    // Build and insert deployed records for each allocation
    const ops = allocations.map((a) => ({
      insertOne: {
        document: {
          resinType: batch.resinType,
          litres: Number(a.litres),
          unit: a.unit || unit,
          producedAt: batch.producedAt || now,
          materialsUsed: (batch.materialsUsed || []).map(m => ({
            material: m.material,
            requiredQty: (m.requiredQty / totalLitres) * Number(a.litres)
          })),
          status: 'deployed',
          clientName: a.clientName,
          fromOrderId: a.orderId ? new ObjectId(a.orderId) : null,
          originalProductionId: batch._id,
          orderNumber: a.displayOrderNumber || (a.orderNumber ? `${a.orderNumber}C${a.clientSeq}` : null),
          fromSplit: false,
          isBatchChild: true
        }
      }
    }));

    if (ops.length > 0) await producedCollection.bulkWrite(ops);

    // Update batch status as deployed
    await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'deployed', deployedAt: now } }
    );

    // Update orders' fulfillment tracking and status
    for (const a of allocations) {
      if (!a.orderId || !ObjectId.isValid(a.orderId)) continue;
      const order = await futureOrdersCollection.findOne({ _id: new ObjectId(a.orderId) });
      if (!order) continue;

      const fulfilledQty = (Number(order.fulfilledQty) || 0) + Number(a.litres);
      const totalQty = Number(order.litres);

      if (fulfilledQty >= totalQty - 1e-9) {
        // Fully dispatched
        await futureOrdersCollection.updateOne(
          { _id: order._id },
          { $set: { status: 'completed', completedAt: now, fulfilledQty: totalQty } }
        );
      } else {
        // Partially dispatched
        await futureOrdersCollection.updateOne(
          { _id: order._id },
          { $set: { status: 'partially_dispatched', updatedAt: now, fulfilledQty } }
        );
      }
    }

    res.json({ message: 'Batch dispatched to clients', count: allocations.length });
  } catch (err) {
    console.error('/api/batches/:id/dispatch error', err);
    res.status(500).json({ message: 'Failed to dispatch batch', error: err.message });
  }
});

// Dispatch a single allocation from a batch
app.post('/api/batches/:id/dispatch-allocation', async (req, res) => {
  const { id } = req.params;
  const { allocationIndex } = req.body;
  
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid batch id' });
  if (allocationIndex == null) return res.status(400).json({ message: 'allocationIndex is required' });
  
  try {
    const { producedCollection, futureOrdersCollection } = await connectDB();
    const batch = await producedCollection.findOne({ _id: new ObjectId(id) });
    
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (!batch.isBatch) return res.status(400).json({ message: 'Not a batch record' });
    if (batch.status !== 'done') return res.status(400).json({ message: 'Batch must be completed before dispatch' });
    
    const allocations = Array.isArray(batch.allocations) ? batch.allocations : [];
    if (allocationIndex < 0 || allocationIndex >= allocations.length) {
      return res.status(400).json({ message: 'Invalid allocation index' });
    }
    
    const alloc = allocations[allocationIndex];
    const now = new Date();
    const totalLitres = Number(batch.litres);
    const unit = batch.unit || 'litres';
    
    // Create deployed record for this allocation
    const deployedRecord = {
      resinType: batch.resinType,
      litres: Number(alloc.litres),
      unit: alloc.unit || unit,
      producedAt: batch.producedAt || now,
      materialsUsed: (batch.materialsUsed || []).map(m => ({
        material: m.material,
        requiredQty: (m.requiredQty / totalLitres) * Number(alloc.litres)
      })),
  status: 'deployed',
      clientName: alloc.clientName,
      fromOrderId: alloc.orderId ? new ObjectId(alloc.orderId) : null,
      originalProductionId: batch._id,
      orderNumber: alloc.displayOrderNumber || (alloc.orderNumber ? `${alloc.orderNumber}C${alloc.clientSeq}` : null),
      fromSplit: false,
      isBatchChild: true
    };
    
    await producedCollection.insertOne(deployedRecord);
    
    // Mark this allocation as dispatched in the batch
    const updatedAllocations = allocations.map((a, idx) => 
      idx === allocationIndex ? { ...a, dispatched: true, dispatchedAt: now } : a
    );
    
    await producedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { allocations: updatedAllocations } }
    );
    
    // Check if all allocations are dispatched
    const allDispatched = updatedAllocations.every(a => a.dispatched === true);
    if (allDispatched) {
      await producedCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'deployed', deployedAt: now } }
      );
    }
    
    // Update order fulfillment
    if (alloc.orderId && ObjectId.isValid(alloc.orderId)) {
      const order = await futureOrdersCollection.findOne({ _id: new ObjectId(alloc.orderId) });
      if (order) {
        const fulfilledQty = (Number(order.fulfilledQty) || 0) + Number(alloc.litres);
        const totalQty = Number(order.litres);

        if (fulfilledQty >= totalQty - 1e-9) {
          await futureOrdersCollection.updateOne(
            { _id: order._id },
            { $set: { status: 'completed', completedAt: now, fulfilledQty: totalQty } }
          );
        } else {
          await futureOrdersCollection.updateOne(
            { _id: order._id },
            { $set: { status: 'partially_dispatched', updatedAt: now, fulfilledQty } }
          );
        }
      }
    }
    
    res.json({ 
      message: `Dispatched ${alloc.litres} litres to ${alloc.clientName}`,
      allDispatched
    });
  } catch (err) {
    console.error('/api/batches/:id/dispatch-allocation error', err);
    res.status(500).json({ message: 'Failed to dispatch allocation', error: err.message });
  }
});

// Delete production and return materials to stock
app.delete('/api/produced-resins/:id', async (req, res) => {
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


// ---------------- Optional: Get Resin Definitions ----------------
app.get("/api/resins", (req, res) => {
  res.json(data);
});


// ---------------- Future Orders API ----------------

// Get all future orders
app.get("/api/future-orders", async (req, res) => {
  try {
    const { futureOrdersCollection } = await connectDB();
    const orders = await futureOrdersCollection.find().sort({ scheduledDate: 1, scheduledTime: 1 }).toArray();
    res.json(orders);
  } catch (err) {
    console.error("GET /future-orders error:", err);
    res.status(500).json({ message: "Failed to fetch future orders" });
  }
});

// Add new future order
app.post("/api/future-orders", async (req, res) => {
  const { clientName, resinType, litres, unit, scheduledDate } = req.body;
  
  if (!clientName || !resinType || !litres || !scheduledDate) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const { futureOrdersCollection, producedCollection } = await connectDB();
    const createdAt = new Date();
    const orderNumber = generateOrderNumber(createdAt);
    const newOrder = {
      clientName,
      resinType,
      litres: Number(litres),
      unit: unit || 'litres',
      scheduledDate,
      createdAt,
      orderTime: createdAt,
      status: 'pending',
      orderNumber
    };

  const result = await futureOrdersCollection.insertOne(newOrder);

    res.status(201).json({ message: "Order added successfully", order: newOrder });
  } catch (err) {
    console.error("POST /future-orders error:", err);
    res.status(500).json({ message: "Failed to add order" });
  }
});
// Clients and reports endpoints are handled by src/routes/clients and src/routes/reports

// Delete a future order
app.delete("/api/future-orders/:id", async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  try {
    const { futureOrdersCollection } = await connectDB();
    const result = await futureOrdersCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    res.json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error("DELETE /future-orders error:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

// ---------------- Billing API ----------------

// Mark billing as done for a set of orders
app.post('/api/billing/done', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const { items, totals } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'No billing items provided' });
  }

  try {
    const { billingCollection, futureOrdersCollection } = await connectDB();
    const orderNumbers = items.map(i => String(i.orderNumber || '')).filter(Boolean);
    if (orderNumbers.length === 0) return res.status(400).json({ message: 'Items missing order numbers' });

    // Prevent duplicate billing for any orderNumber
    const dup = await billingCollection.findOne({ 'items.orderNumber': { $in: orderNumbers } });
    if (dup) {
      return res.status(409).json({ message: 'One or more orders have already been billed' });
    }
    
    // Check for partially dispatched orders - prevent billing incomplete orders
    for (const item of items) {
      if (!item.orderNumber) continue;
      // Extract base order number (remove C1, C2, etc suffixes)
      const baseOrderNum = item.orderNumber.replace(/C\d+$/, '');
      const order = await futureOrdersCollection.findOne({ orderNumber: baseOrderNum });
      if (order && order.status === 'partially_dispatched') {
        const fulfilled = Number(order.fulfilledQty) || 0;
        const total = Number(order.litres);
        return res.status(400).json({ 
          message: `Cannot bill order ${baseOrderNum} for ${order.clientName}. Only ${fulfilled}/${total} ${order.unit || 'litres'} have been dispatched. Complete the full order before billing.` 
        });
      }
    }

    const doc = {
      items: items.map(i => ({
        orderNumber: i.orderNumber,
        resinType: i.resinType,
        clientName: i.clientName,
        litres: Number(i.litres) || 0,
        rate: Number(i.rate) || 0,
        lineTotal: Number(i.lineTotal) || 0,
        transactionShare: Number(i.transactionShare) || 0,
        cashShare: Number(i.cashShare) || 0,
        gstShare: Number(i.gstShare) || 0,
        deployedAt: i.deployedAt ? new Date(i.deployedAt) : null
      })),
      totals: {
        subtotal: Number(totals?.subtotal) || 0,
        transactionPercent: Number(totals?.transactionPercent) || 0,
        transactionBase: Number(totals?.transactionBase) || 0,
        gst: Number(totals?.gst) || 0,
        transactionTotal: Number(totals?.transactionTotal) || 0,
        cashAmount: Number(totals?.cashAmount) || 0,
        grandTotal: Number(totals?.grandTotal) || 0,
      },
      status: 'done',
      createdAt: new Date()
    };

    await billingCollection.insertOne(doc);
    res.status(201).json({ message: 'Billing marked as done', billing: doc });
  } catch (err) {
    console.error('/api/billing/done error', err);
    res.status(500).json({ message: 'Failed to save billing', error: err.message });
  }
});

// Get all billing documents
app.get('/api/billing', async (req, res) => {
  try {
    const { billingCollection } = await connectDB();
    const docs = await billingCollection.find().sort({ createdAt: -1 }).toArray();
    const safeDocs = docs.map(d => ({
      ...d,
      _id: d._id.toString(),
      createdAt: d.createdAt ? d.createdAt.toISOString() : null
    }));
    res.json(safeDocs);
  } catch (err) {
    console.error('/api/billing GET error', err);
    res.status(500).json({ message: 'Failed to fetch billing' });
  }
});

// Get billing documents that include specified orders
app.get('/api/billing/by-orders', async (req, res) => {
  try {
    const { orders } = req.query; // comma-separated
    if (!orders) return res.json([]);
    const list = String(orders).split(',').map(s => s.trim()).filter(Boolean);
    const { billingCollection } = await connectDB();
    const docs = await billingCollection.find({ 'items.orderNumber': { $in: list } }).toArray();
    const safeDocs = docs.map(d => ({
      ...d,
      _id: d._id.toString(),
      createdAt: d.createdAt ? d.createdAt.toISOString() : null
    }));
    res.json(safeDocs);
  } catch (err) {
    console.error('/api/billing/by-orders error', err);
    res.status(500).json({ message: 'Failed to fetch billing by orders' });
  }
});

// Delete billing record (password protected)
app.delete('/api/billing/:id', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid billing ID' });
  }
  try {
    const { billingCollection } = await connectDB();
    const result = await billingCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Billing record not found' });
    }
    res.json({ message: 'Billing record deleted successfully' });
  } catch (err) {
    console.error('/api/billing DELETE error', err);
    res.status(500).json({ message: 'Failed to delete billing record' });
  }
});

// Update order status (e.g., when starting production)
app.patch("/api/future-orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  try {
    const { futureOrdersCollection, producedCollection } = await connectDB();
    const order = await futureOrdersCollection.findOne({ _id: new ObjectId(id) });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const result = await futureOrdersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    // Auto-batching disabled: do not generate batches on status changes

    res.json({ message: "Order status updated successfully" });
  } catch (err) {
    console.error("PATCH /future-orders status error:", err);
    res.status(500).json({ message: "Failed to update order status" });
  }
});

// ---------------- Expenses API ----------------

// Get all expenses (with optional month filter)
app.get('/api/expenses', async (req, res) => {
  try {
    const { expensesCollection } = await connectDB();
    const { month, year } = req.query;
    
    let query = {};
    if (month && year) {
      query.month = month;
      query.year = year;
    }
    
    const expenses = await expensesCollection.find(query).sort({ year: -1, month: -1, createdAt: -1 }).toArray();
    res.json(expenses);
  } catch (err) {
    console.error('/api/expenses GET error', err);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
});

// Add new monthly expense
app.post('/api/expenses', async (req, res) => {
  const { month, year, category, employeeName, monthlyAmount, description } = req.body;

  const allowedCategories = ['Office staff', 'Helper', 'Chemist', 'Accountant', 'Driver', 'Car Driver', 'Tanker Driver', 'Plant Operator', 'Manager', 'Conductor', 'Lab'];

  if (!month || !year || !category || !monthlyAmount) {
    return res.status(400).json({ message: 'Month, year, category, and monthly amount are required' });
  }

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({ message: 'Invalid category' });
  }
  
  const amountNum = Number(monthlyAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ message: 'Monthly amount must be a positive number' });
  }
  
  try {
    const { expensesCollection } = await connectDB();
    
    // Check if expense already exists for this month/year/category/employee
    const existing = await expensesCollection.findOne({
      month,
      year,
      category,
      employeeName: employeeName || null
    });
    
    if (existing) {
      return res.status(409).json({ 
        message: 'Expense already exists for this month/category/employee combination. Please update instead.' 
      });
    }
    
    const expense = {
      month,
      year,
      category,
      employeeName: employeeName || null,
      monthlyAmount: amountNum,
      description: description || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await expensesCollection.insertOne(expense);
    expense._id = result.insertedId;
    res.status(201).json({ message: 'Monthly expense added successfully', expense });
  } catch (err) {
    console.error('/api/expenses POST error', err);
    res.status(500).json({ message: 'Failed to add expense' });
  }
});

// Update monthly expense
app.put('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { month, year, category, employeeName, monthlyAmount, description } = req.body;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid expense ID' });
  }
  
  const allowedCategories = ['Office staff', 'Helper', 'Chemist', 'Accountant', 'Driver', 'Car Driver', 'Tanker Driver', 'Plant Operator', 'Manager', 'Conductor', 'Lab'];

  if (!month || !year || !category || !monthlyAmount) {
    return res.status(400).json({ message: 'Month, year, category, and monthly amount are required' });
  }

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({ message: 'Invalid category' });
  }
  
  const amountNum = Number(monthlyAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ message: 'Monthly amount must be a positive number' });
  }
  
  try {
    const { expensesCollection } = await connectDB();
    const result = await expensesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
          $set: { 
            month,
            year,
            category: category || null,
            employeeName: employeeName || null,
            monthlyAmount: amountNum,
            description: description || '',
            updatedAt: new Date()
          } 
        }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json({ message: 'Monthly expense updated successfully' });
  } catch (err) {
    console.error('/api/expenses PUT error', err);
    res.status(500).json({ message: 'Failed to update expense' });
  }
});

// Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const { id } = req.params;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid expense ID' });
  }
  
  try {
    const { expensesCollection } = await connectDB();
    const result = await expensesCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('/api/expenses DELETE error', err);
    res.status(500).json({ message: 'Failed to delete expense' });
  }
});

// Get expense summary by category for a month
app.get('/api/expenses/summary', async (req, res) => {
  try {
    const { expensesCollection } = await connectDB();
    const { month, year } = req.query;
    
    let query = {};
    if (month && year) {
      query.month = month;
      query.year = year;
    }
    
    const expenses = await expensesCollection.find(query).toArray();
    
    const allowedCategories = ['Office staff', 'Helper', 'Chemist', 'Accountant', 'Driver', 'Car Driver', 'Tanker Driver', 'Plant Operator', 'Manager', 'Conductor', 'Lab'];

    const summary = { total: 0, count: expenses.length };
    // initialize each category key to 0
    allowedCategories.forEach(c => { summary[c] = 0; });

    expenses.forEach(exp => {
      const amt = Number(exp.monthlyAmount) || 0;
      const key = exp.category || 'Unknown';
      if (!summary[key]) summary[key] = 0;
      summary[key] += amt;
      summary.total += amt;
    });

    res.json(summary);
  } catch (err) {
    console.error('/api/expenses/summary GET error', err);
    res.status(500).json({ message: 'Failed to get expense summary' });
  }
});

// ---------------- Start Server ----------------
app.listen(port, () => console.log(`✅ Server running on http://localhost:${port}`));