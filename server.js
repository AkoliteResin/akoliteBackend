const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const data = require("./data"); // your resin definitions


const app = express();
const port = 5000;


app.use(cors());
app.use(express.json());


const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);


async function connectDB() {
  if (!client.topology?.isConnected()) await client.connect();
  const db = client.db("resinDB");
  const rawCollection = db.collection("raw_materials");
  const producedCollection = db.collection("produced_resins");


  // initialize raw materials if DB empty
  const count = await rawCollection.countDocuments();
  if (count === 0) {
    const materials = [];
    data.forEach((resin) => {
      resin.raw_materials.forEach((mat) => {
        if (!materials.find((m) => m.name === mat.name)) {
          materials.push({ name: mat.name, totalQuantity: 0, updatedAt: new Date() });
        }
      });
    });
    await rawCollection.insertMany(materials);
    console.log("✅ Initialized raw_materials in DB");
  }


  return { rawCollection, producedCollection };
}


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


// ---------------- Resin Production API ----------------


app.post("/api/produce-resin", async (req, res) => {
  const { resinType, litres } = req.body;
  if (!resinType || !litres) return res.status(400).json({ message: "Invalid input" });


  const resin = data.find((r) => r.name === resinType);
  if (!resin) return res.status(400).json({ message: `Resin type "${resinType}" not found` });


  const totalRatio = resin.raw_materials.reduce((sum, r) => sum + r.ratio, 0);


  // calculate required quantity for each raw material
  const requiredMaterials = resin.raw_materials.map((r) => ({
    material: r.name,
    requiredQty: (r.ratio / totalRatio) * litres,
  }));


  try {
    const { rawCollection, producedCollection } = await connectDB();
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
      console.log(`✅ Subtracted ${reqMat.requiredQty} of ${reqMat.material}`);
    }


    // Save production record (mark as pending)
    await producedCollection.insertOne({
      resinType,
      litres: Number(litres),
      producedAt: new Date(),
      materialsUsed: requiredMaterials,
      status: 'pending'
    });


    res.json({
      message: `Produced ${litres} litres of ${resinType}`,
      requiredMaterials,
    });
  } catch (err) {
    console.error("POST /produce-resin error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ---------------- Produced Resins API ----------------


// app.get("/api/produced-resins", async (req, res) => {
//   try {
//     const { producedCollection } = await connectDB();
//     const producedList = await producedCollection.find().sort({ producedAt: -1 }).toArray();
//     res.json(producedList);
//   } catch (err) {
//     console.error("GET /produced-resins error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });




app.get("/api/produced-resins", async (req, res) => {
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
      status: resin.status || 'pending'
    }));

    res.json({
      items: safeList,
      total: safeList.length
    });
  } catch (err) {
    console.error("GET /produced-resins error:", err);
    res.status(500).json({ 
      message: "Failed to fetch produced resins",
      error: err.message 
    });
  }
});


// Mark resin as in-process (proceed)
app.post('/api/produced-resins/:id/proceed', async (req, res) => {
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
app.post('/api/produced-resins/:id/complete', async (req, res) => {
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const { producedCollection } = await connectDB();
    const result = await producedCollection.findOneAndUpdate(
      { _id: new ObjectId(id), status: { $nin: ['deleted', 'deployed'] } },
      { $set: { status: 'done', completedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ message: 'Production not found or cannot be completed' });
    const updated = result.value;
    updated._id = updated._id.toString();
    res.json({ message: 'Production marked as done', production: updated });
  } catch (err) {
    console.error('/complete error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Deploy production
app.post('/api/produced-resins/:id/deploy', async (req, res) => {
  const { id } = req.params;
  if (!id || !ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const { producedCollection } = await connectDB();
    const result = await producedCollection.findOneAndUpdate(
      { _id: new ObjectId(id), status: { $nin: ['deleted', 'deployed'] } },
      { $set: { status: 'deployed', deployedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ message: 'Production not found or cannot be deployed' });
    const updated = result.value;
    updated._id = updated._id.toString();
    res.json({ message: 'Production deployed', production: updated });
  } catch (err) {
    console.error('/deploy error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete production and return materials to stock
app.delete('/api/produced-resins/:id', async (req, res) => {
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


// ---------------- Start Server ----------------
app.listen(port, () => console.log(`✅ Server running on http://localhost:${port}`));