const { v4: uuidv4 } = require("uuid");
const connectDB = require("../config/db");
const { COLLECTIONS } = require("../config/constants");

async function getRawCollection() {
  const db = await connectDB();
  return db.collection(COLLECTIONS.RAW_MATERIALS_STOCK);
}

async function getHistoryCollection() {
  const db = await connectDB();
  return db.collection(COLLECTIONS.RAW_MATERIALS_HISTORY);
}

module.exports = {
  getRawCollection,
  getHistoryCollection,
};
