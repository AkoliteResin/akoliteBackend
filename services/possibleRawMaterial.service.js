const { v4: uuidv4 } = require("uuid");
const { getCollection } = require("../models/possibleRawMaterial.model");
const { possibleRawMaterialSchema } = require("../validation/possibleRawMaterial.validation");

/**
 * Escape special regex characters in string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Creates a possible raw material after validation and duplicate check
 */
async function createPossibleRawMaterial(payload) {
  const { error, value } = possibleRawMaterialSchema.validate(payload);
  if (error) throw new Error(error.details[0].message);

  const collection = await getCollection();

  const existing = await collection.findOne({ 
    name: { $regex: `^${escapeRegex(value.name)}$`, $options: "i" } 
  });
  if (existing) throw new Error("Raw material with this name already exists");

  const doc = {
    id: uuidv4(),
    name: value.name,
    createdDate: new Date(),
  };

  await collection.insertOne(doc);
  return doc;
}

/**
 * List all possible raw materials
 */
async function listPossibleRawMaterials() {
  const collection = await getCollection();
  const rows = await collection.find().sort({ createdDate: -1 }).toArray();

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    createdDate: r.createdDate,
  }));
}

module.exports = {
  createPossibleRawMaterial,
  listPossibleRawMaterials,
};
