require('dotenv').config();

const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { connectDB } = require('./src/db');
const config = require('./config');
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
const port = config.PORT;

// Configure CORS to allow your frontend domain
const corsOptions = {
  origin: [
    'https://akoliteresin.github.io',
    'https://dj4haaiis0la7.cloudfront.net',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Global error handling middleware - log all errors
app.use((err, req, res, next) => {
  console.error('Error caught by middleware:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

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

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ---------------- Start Server ----------------

// Try to load SSL certificates for HTTPS
const sslOptions = {};
const keyPath = process.env.SSL_KEY_PATH || '/etc/ssl/private/server.key';
const certPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/server.crt';

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  sslOptions.key = fs.readFileSync(keyPath);
  sslOptions.cert = fs.readFileSync(certPath);
  console.log('✅ SSL certificates loaded. Starting HTTPS server...');
}

let server;
if (Object.keys(sslOptions).length > 0) {
  // Use HTTPS if certificates are available
  server = https.createServer(sslOptions, app);
} else {
  // Fall back to HTTP if no certificates
  const http = require('http');
  server = http.createServer(app);
}

server.listen(port, config.HOST, () => {
  const protocol = Object.keys(sslOptions).length > 0 ? 'HTTPS' : 'HTTP';
  console.log(`✅ Server running on ${protocol} at ${config.getServerUrl()}`);
});

server.on('error', (err) => {
  console.error('Server failed to start:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});