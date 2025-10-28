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
  const allRawIds = value.rawMaterials.map(r => r.rawMaterialId);
  const found = await possibleRawCollection.find({ id: { $in: allRawIds } }).toArray();

  if (found.length !== allRawIds.length) {
    throw new Error("One or more raw_material_ids are invalid");
  }

  // Create the formula
  const doc = {
    id: uuidv4(),
    name: value.name,
    rawMaterials: value.rawMaterials,
    createdDate: new Date(),
  };

  await collection.insertOne(doc);
  return doc;
}

/**
 * Get all formulas (fetch raw material names dynamically)
 */
async function listProductFormulasService() {
  const collection = await getCollection();
  const formulas = await collection.find().sort({ createdDate: -1 }).toArray();

  const possibleRawMaterialCollection = await getPossibleRawMaterialCollection();
  const possibleRawMaterials = await possibleRawMaterialCollection.find().toArray();

  const materialMap = possibleRawMaterials.reduce((acc, m) => {
    acc[m.id] = m.name;
    return acc;
  }, {});

  return formulas.map(f => ({
    id: f.id,
    name: f.name,
    createdDate: f.createdDate,
    rawMaterials: f.rawMaterials.map(r => ({
      rawMaterialId: r.rawMaterialId,
      rawMaterialsName: materialMap[r.rawMaterialId] || "Unknown",
      percentage: r.percentage,
    })),
  }));
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
