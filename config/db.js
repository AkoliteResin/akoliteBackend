const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

let db = null;

async function connectDB() {
  if (db) return db; // Return cached db if already connected

  try {
    await client.connect(); // Connect once
    db = client.db("resinDB");
    console.log("✅ MongoDB connected");
    return db;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    throw err;
  }
}

module.exports = connectDB;
