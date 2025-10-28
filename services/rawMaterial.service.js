const { v4: uuidv4 } = require("uuid");
const { getRawCollection, getHistoryCollection } = require("../models/rawMaterial.model");
const connectDB = require("../config/db");
const { COLLECTIONS, HISTORY_ACTION_TYPES, CHANGE_DIRECTIONS } = require("../config/constants");

async function addRawMaterialStock({ rawMaterialId, quantity, receivedDate }) {
  const collection = await getRawCollection();
  const historyCollection = await getHistoryCollection();

  const db = await connectDB();
  const possibleMaterial = await db
    .collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS)
    .findOne({ id: rawMaterialId });

  if (!possibleMaterial) throw new Error("Invalid rawMaterialId");

  const date = receivedDate ? new Date(receivedDate) : new Date();

  await collection.updateOne(
    { rawMaterialId },
    {
      $inc: { totalQuantity: quantity },
      $set: { updatedDate: new Date() }
    },
    { upsert: true }
  );

  // Create history record
  const historyDoc = {
    id: uuidv4(),
    rawMaterialId,
    name: possibleMaterial.name,
    quantity,
    actionType: HISTORY_ACTION_TYPES.NEW_STOCK,
    changeDirection: CHANGE_DIRECTIONS.INCREASE,
    createdDate: date
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

async function getRawMaterialHistory({ rawMaterialId, actionType, page = 1, limit = 10 }) {
  const historyCollection = await getHistoryCollection();
  const skip = (page - 1) * limit;

  // Build dynamic query
  const query = {};
  if (rawMaterialId) query.rawMaterialId = rawMaterialId;
  if (actionType) query.actionType = actionType;

  const docs = await historyCollection
    .find(query)
    .sort({ createdDate: -1 })
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

async function useRawMaterialForProduction({ rawMaterialId, quantity, referenceId }) {
  const collection = await getRawCollection();
  const historyCollection = await getHistoryCollection();
  const db = await connectDB();

  // 🔍 Validate material existence
  const material = await db
    .collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS)
    .findOne({ id: rawMaterialId });

  if (!material) throw new Error("Invalid rawMaterialId");
  if (quantity <= 0) throw new Error("Quantity must be a positive number");

  // 📦 Check available stock
  const stock = await collection.findOne({ rawMaterialId });
  const availableQty = stock ? stock.totalQuantity : 0;

  if (availableQty < quantity) {
    throw new Error(
      `Insufficient stock for ${material.name}. Required: ${quantity}, Available: ${availableQty}`
    );
  }

  // 🔻 Deduct stock
  await collection.updateOne(
    { rawMaterialId },
    {
      $inc: { totalQuantity: -quantity },
      $set: { updatedDate: new Date() }
    }
  );

  // 🧾 Record history
  const historyDoc = {
    id: uuidv4(),
    rawMaterialId,
    name: material.name,
    quantity,
    actionType: HISTORY_ACTION_TYPES.USED_FOR_PRODUCTION,
    changeDirection: CHANGE_DIRECTIONS.DECREASE,
    referenceId: referenceId || null, // optional link to production request
    createdDate: new Date()
  };

  await historyCollection.insertOne(historyDoc);

  return {
    message: "Raw material successfully used for production",
    material: material.name,
    usedQuantity: quantity,
    remainingQuantity: availableQty - quantity,
    history: historyDoc
  };
}


module.exports = {
  addRawMaterialStock,
  listAllRawMaterials,
  getRawMaterialHistory,
  useRawMaterialForProduction
};
