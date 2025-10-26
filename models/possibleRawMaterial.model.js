const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { COLLECTIONS } = require("../config/constants");
const connectDB = require("../config/db");

// Joi schema for validation
const possibleRawMaterialSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
});

// factory + db helpers
async function getCollection() {
  const db = await connectDB();
  return db.collection(COLLECTIONS.POSSIBLE_RAW_MATERIALS);
}

/**
 * Creates a validated possible raw material object
 * and inserts into DB (if not duplicate name).
 */
async function createPossibleRawMaterial(payload) {
  const { error, value } = possibleRawMaterialSchema.validate(payload);
  if (error) throw new Error(error.details[0].message);

  const collection = await getCollection();

  // check duplicate by name (case-insensitive)
  const existing = await collection.findOne({ name: { $regex: `^${escapeRegex(value.name)}$`, $options: "i" }});
  if (existing) {
    throw new Error("Raw material with this name already exists");
  }

  const doc = {
    id: uuidv4(),
    name: value.name,
    addedDate: new Date(),
  };

  await collection.insertOne(doc);
  return doc;
}

async function listPossibleRawMaterials() {
  const collection = await getCollection();
  const rows = await collection.find().sort({ addedDate: -1 }).toArray();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    addedDate: r.addedDate,
  }));
}

function escapeRegex(string) {
  // simple regex escape to avoid special chars in names
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  createPossibleRawMaterial,
  listPossibleRawMaterials,
  possibleRawMaterialSchema,
};
