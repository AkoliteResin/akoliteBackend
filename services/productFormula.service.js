const { v4: uuidv4 } = require("uuid");
const { getCollection } = require("../models/productFormula.model");
const { getCollection: getPossibleRawMaterialCollection } = require("../models/possibleRawMaterial.model");

/**
 * Create a new product formula
 */
async function createProductFormulaService(value) {
  const collection = await getCollection();

  // Check for duplicate product name
  const existing = await collection.findOne({
    name: { $regex: `^${value.name}$`, $options: "i" },
  });
  if (existing) throw new Error("Product formula with this name already exists");

  // Validate raw material IDs
  const possibleRawCollection = await getPossibleRawMaterialCollection();
  const allRawIds = value.raw_materials.map(r => r.raw_material_id);
  const found = await possibleRawCollection.find({ id: { $in: allRawIds } }).toArray();

  if (found.length !== allRawIds.length) {
    throw new Error("One or more raw_material_ids are invalid");
  }

  // Create the formula
  const doc = {
    id: uuidv4(),
    name: value.name,
    raw_materials: value.raw_materials,
    createdDate: new Date(),
  };

  await collection.insertOne(doc);
  return doc;
}

/**
 * Get all product formulas
 */
async function listProductFormulasService() {
  const collection = await getCollection();
  return await collection.find().sort({ createdDate: -1 }).toArray();
}

/**
 * Delete formula by ID
 */
async function deleteProductFormulaService(id) {
  const collection = await getCollection();
  const result = await collection.deleteOne({ id });
  return result.deletedCount > 0;
}

module.exports = {
  createProductFormulaService,
  listProductFormulasService,
  deleteProductFormulaService,
};
