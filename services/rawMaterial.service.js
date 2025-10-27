const { v4: uuidv4 } = require("uuid");
const { getRawCollection, getHistoryCollection } = require("../models/rawMaterial.model");
const connectDB = require("../config/db");
const { COLLECTIONS } = require("../config/constants");

async function addRawMaterialStock({ rawMaterialId, quantity, receivedDate }) {
  const collection = await getRawCollection();
  const historyCollection = await getHistoryCollection();

  const db = await connectDB();
  const possibleMaterial = await db
    .collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS)
    .findOne({ id: rawMaterialId });

  if (!possibleMaterial) throw new Error("Invalid rawMaterialId");
//   if (quantity <= 0) throw new Error("Quantity must be positive");

  const date = receivedDate ? new Date(receivedDate) : new Date();

  await collection.updateOne(
    { rawMaterialId },
    { 
      $inc: { totalQuantity: quantity },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );

  const historyDoc = {
    id: uuidv4(),
    rawMaterialId,
    name: possibleMaterial.name,
    quantity,
    receivedDate: date
  };
  await historyCollection.insertOne(historyDoc);

  return historyDoc;
}

async function listAllRawMaterials() {
  const rawCollection = await getRawCollection();
  const db = await connectDB();

  const possibleMaterials = await db
    .collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS)
    .find()
    .toArray();

  const rawStocks = await rawCollection.find().toArray();

  return possibleMaterials.map(pm => {
    const stock = rawStocks.find(r => r.rawMaterialId === pm.id);
    return {
      id: pm.id,
      name: pm.name,
      totalQuantity: stock ? stock.totalQuantity : 0
    };
  });
}

async function getRawMaterialHistory({ rawMaterialId, page = 1, limit = 10 }) {
  const historyCollection = await getHistoryCollection();
  const query = rawMaterialId ? { rawMaterialId } : {};
  const skip = (page - 1) * limit;

  const docs = await historyCollection
    .find(query)
    .sort({ receivedDate: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const total = await historyCollection.countDocuments(query);

  return {
    total,
    page,
    limit,
    data: docs
  };
}

module.exports = {
  addRawMaterialStock,
  listAllRawMaterials,
  getRawMaterialHistory
};
