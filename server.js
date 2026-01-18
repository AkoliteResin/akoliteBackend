require('dotenv').config();

const express = require("express");
const cors = require("cors");
const { connectDB } = require('./src/db');
const data = require("./data"); // your resin definitions
const { verifyToken } = require('./src/middleware/auth');

// Import Routers
const authRouter = require('./src/routes/auth');
const suppliersRouter = require('./src/routes/suppliers');
const clientsRouter = require('./src/routes/clients');
const reportsRouter = require('./src/routes/reports');
const producedResinsRouter = require('./src/routes/producedResins');
const expensesRouter = require('./src/routes/expenses');
const overtimeRouter = require('./src/routes/overtime');
const ordersRouter = require('./src/routes/orders');
const resinsRouter = require('./src/routes/resins');
const sellersRouter = require('./src/routes/sellers');
const billingRouter = require('./src/routes/billing');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Authentication routes (no token required)
app.use('/api/auth', authRouter);

// Protect all other routes with JWT verification
app.use('/api/suppliers', verifyToken, suppliersRouter);
app.use('/api/clients', verifyToken, clientsRouter);
app.use('/api/sellers', verifyToken, sellersRouter);
app.use('/api/reports', verifyToken, reportsRouter);
app.use('/api/expenses', verifyToken, expensesRouter);
app.use('/api/overtime', verifyToken, overtimeRouter);
app.use('/api/future-orders', verifyToken, ordersRouter);
app.use('/api/resins', verifyToken, resinsRouter);
app.use('/api/billing', verifyToken, billingRouter);
app.use('/api', verifyToken, producedResinsRouter); // Handles /produce-resin, /produced-resins, etc.

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

// NOTE: Resin GET/POST/PUT/DELETE handled by `resins` router (falls back to static `data` when DB empty)

// ---------------- Start Server ----------------
const server = app.listen(port, () => console.log(`✅ Server running on http://localhost:${port}`));

server.on('error', (err) => {
  console.error('Server failed to start:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});