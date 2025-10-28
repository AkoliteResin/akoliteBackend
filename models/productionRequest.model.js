// const connectDB  = require("../config/db");
const connectDB = require("../config/db");

async function getCollection() {
  const db = await connectDB();
  return db.collection("production_requests");
}

module.exports = { getCollection };
