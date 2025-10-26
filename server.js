require("dotenv").config(); // load env variables
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./config/db");

// Import routes
const possibleRawMaterialRoutes = require("./routes/possibleRawMaterialRoutes");

const app = express();
const port = process.env.PORT || 8080;

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(express.json());

// Log all HTTP requests to console in 'dev' format
app.use(morgan("dev"));

// Optional: log POST/PUT request body
app.use((req, res, next) => {
  if (["POST", "PUT"].includes(req.method)) {
    console.log("📦 Request Body:", req.body);
  }
  next();
});

// ---------------- ROUTES ----------------
app.use("/api/possible-raw-materials", possibleRawMaterialRoutes);

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