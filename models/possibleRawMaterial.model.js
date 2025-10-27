const connectDB = require("../config/db");
const { COLLECTIONS } = require("../config/constants");

async function getCollection() {
  const db = await connectDB();
  return db.collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS);
}

module.exports = { getCollection };
