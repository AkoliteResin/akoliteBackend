const Joi = require("joi");
const { v4: uuidv4 } = require("uuid");
const connectDB = require("../config/db");
const { COLLECTIONS } = require("../config/constants");

async function getRawCollection() {
  const db = await connectDB();
  return db.collection(COLLECTIONS.RAW_MATERIALS);
}

async function getHistoryCollection() {
  const db = await connectDB();
  return db.collection(COLLECTIONS.RAW_MATERIALS_HISTORY);
}

// Validate payload
const addRawMaterialSchema = Joi.object({
  rawMaterialId: Joi.string().uuid().required(),
  quantity: Joi.number().positive().required(),
  receivedDate: Joi.date().optional()
});

// Add raw material stock
async function addRawMaterialStock({ rawMaterialId, quantity, receivedDate }) {
  const collection = await getRawCollection();
  const historyCollection = await getHistoryCollection();

  const db = await connectDB();
  const possibleMaterial = await db
    .collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS)
    .findOne({ id: rawMaterialId });

  if (!possibleMaterial) throw new Error("Invalid rawMaterialId");
  if (quantity <= 0) throw new Error("Quantity must be positive");

  const date = receivedDate ? new Date(receivedDate) : new Date();

  // Update total quantity (upsert)
  await collection.updateOne(
    { rawMaterialId },
    { 
      $inc: { totalQuantity: quantity },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );

  // Save history
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

// List all raw material quantities
async function listAllRawMaterials() {
  const rawCollection = await getRawCollection();
  const db = await connectDB();

  // get possible raw materials
  const possibleMaterials = await db
    .collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS)
    .find()
    .toArray();

  // get current stock
  const rawStocks = await rawCollection.find().toArray();

  // combine
  return possibleMaterials.map(pm => {
    const stock = rawStocks.find(r => r.rawMaterialId === pm.id);
    return {
      id: pm.id,
      name: pm.name,
      totalQuantity: stock ? stock.totalQuantity : 0
    };
  });
}


// History with pagination
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
  addRawMaterialSchema,
  addRawMaterialStock,
  listAllRawMaterials,
  getRawMaterialHistory
};
