const { v4: uuidv4 } = require("uuid");
const { getCollection: getProductionRequestCollection } = require("../models/productionRequest.model");
const { getCollection: getFormulaCollection } = require("../models/productFormula.model");
const { getRawCollection: getRawMaterialCollection,
        getHistoryCollection: getHistoryCollection
 } = require("../models/rawMaterial.model");
 const { useRawMaterialForProduction } = require("../services/rawMaterial.service");
const { getCollection: getPossibleRawMaterialCollection } = require("../models/possibleRawMaterial.model");

/**
 * Raise a production request — deducts materials & records usage history
 */
async function raiseProductionRequest({ productName, quantity }) {
  if (!productName || !quantity || quantity <= 0)
    throw new Error("Invalid input: productName and quantity are required");

  const formulaCollection = await getFormulaCollection();
  const formula = await formulaCollection.findOne({
    name: { $regex: `^${productName}$`, $options: "i" }
  });
  if (!formula) throw new Error(`No formula found for product '${productName}'`);

  const rawMaterialCollection = await getRawMaterialCollection();
  const possibleRawMaterialCollection = await getPossibleRawMaterialCollection();

  // 🔍 Fetch all possible raw materials for name lookup
  const possibleRawMaterials = await possibleRawMaterialCollection.find().toArray();
  const materialNameMap = possibleRawMaterials.reduce((acc, m) => {
    acc[m.id] = m.name;
    return acc;
  }, {});

  // 🧮 Calculate required raw materials
  const requiredMaterials = [];
  for (const mat of formula.rawMaterials) {
    const requiredQty = (mat.percentage / 100) * quantity;

    const rawMat = await rawMaterialCollection.findOne({ rawMaterialId: mat.rawMaterialId });
    const availableQty = rawMat ? rawMat.totalQuantity : 0;

    if (availableQty < requiredQty) {
      throw new Error(
        `Insufficient stock for ${materialNameMap[mat.rawMaterialId] || "Unknown"} — need ${requiredQty}, have ${availableQty}`
      );
    }

    requiredMaterials.push({
      rawMaterialId: mat.rawMaterialId,
      rawMaterialName: materialNameMap[mat.rawMaterialId] || "Unknown",
      requiredQty,
      beforeQty: availableQty,
      afterQty: availableQty - requiredQty
    });
  }

  // 🧾 Create the production request record
  const productionRequestCollection = await getProductionRequestCollection();
  const requestId = uuidv4();
  const request = {
    id: requestId,
    productName,
    quantity,
    materials: requiredMaterials,
    status: "requested",
    createdDate: new Date()
  };
  await productionRequestCollection.insertOne(request);

  // 🏭 Deduct stock & create history records
  for (const mat of requiredMaterials) {
    await useRawMaterialForProduction({
      rawMaterialId: mat.rawMaterialId,
      quantity: mat.requiredQty,
      referenceId: requestId // ✅ link history to this production request
    });
  }

  return request;
}

/**
 * List all production requests
 */
async function listProductionRequests() {
  const collection = await getProductionRequestCollection();
  return await collection.find().sort({ createdDate: -1 }).toArray();
}

module.exports = {
  raiseProductionRequest,
  listProductionRequests,
};
