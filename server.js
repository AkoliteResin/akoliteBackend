require("dotenv").config(); // load env variables
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./config/db");

// Import routes
const possibleRawMaterialRoutes = require("./routes/possibleRawMaterialRoutes");
const rawMaterialRoutes = require("./routes/rawMaterialRoutes");

const app = express();
const port = process.env.PORT || 8080;

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(express.json());

// Log all HTTP requests to console in 'dev' format using morgan. for POST/PUT, also log request body
app.use(morgan("dev"));
app.use((req, res, next) => {
  if (["POST", "PUT"].includes(req.method)) {
    console.log("📦 Request Body:", req.body);
  }
  next();
});

// ---------------- ROUTES ----------------

app.get("/api/health", async (req, res) => {
  try {
    const db = await connectDB();
    await db.command({ ping: 1 });
    res.json({ status: "ok", message: "MongoDB connected" });
  } catch (err) {
    res.status(500).json({ status: "error", message: "MongoDB not connected" });
  }
});

app.use("/api/possible-raw-materials", possibleRawMaterialRoutes);
app.use("/api/raw-materials", rawMaterialRoutes);

// ---------------- START SERVER ----------------
(async () => {
  try {
    await connectDB(); // connect to MongoDB
    app.listen(port, () => {
      console.log(`✅ Server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
})();