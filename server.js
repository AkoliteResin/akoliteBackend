const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
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


    // Save production record
    await producedCollection.insertOne({
      resinType,
      litres: Number(litres),
      producedAt: new Date(),
      materialsUsed: requiredMaterials,
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
  const resins = await producedCollection.find().sort({ producedAt: -1 }).toArray();
  const safeResins = resins.map(r => ({
    ...r,
    _id: r._id.toString(),
    producedAt: r.producedAt ? new Date(r.producedAt).toISOString() : null,
  }));
  res.json(safeResins);
});


// ---------------- Optional: Get Resin Definitions ----------------
app.get("/api/resins", (req, res) => {
  res.json(data);
});


// ---------------- Start Server ----------------
app.listen(port, () => console.log(`✅ Server running on http://localhost:${port}`));