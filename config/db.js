const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);
let db = null;

async function connectDB() {
  if (!client.topology?.isConnected()) await client.connect();
  if (!db) db = client.db("resinDB");
  return db;
}

module.exports = connectDB;