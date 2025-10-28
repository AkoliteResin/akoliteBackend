const { v4: uuidv4 } = require("uuid");
const { getCollection: getProductionRequestCollection } = require("../models/productionRequest.model");
const { getCollection: getFormulaCollection } = require("../models/productFormula.model");
const { getRawCollection: getRawMaterialCollection,
        getHistoryCollection: getHistoryCollection
 } = require("../models/rawMaterial.model");
 const { useRawMaterialForProduction, restoreRawMaterialsAfterCancel } = require("../services/rawMaterial.service");
const { getCollection: getPossibleRawMaterialCollection } = require("../models/possibleRawMaterial.model");
const { PRODUCTION_STATUS, VALID_STATUS_TRANSITIONS,  } = require("../config/constants");

/**
 * HELPER FUNCTIONS
 */

async function getFormulaByProductName(productName) {
  const formulaCollection = await getFormulaCollection();
  const formula = await formulaCollection.findOne({
    name: { $regex: `^${productName}$`, $options: "i" }
  });
  if (!formula) throw new Error(`No formula found for product '${productName}'`);
  return formula;
}

async function calculateRequiredMaterials(formula, quantity) {
  const rawMaterialCollection = await getRawMaterialCollection();
  const possibleRawMaterialCollection = await getPossibleRawMaterialCollection();

  const possibleRawMaterials = await possibleRawMaterialCollection.find().toArray();
  const materialNameMap = possibleRawMaterials.reduce((acc, m) => {
    acc[m.id] = m.name;
    return acc;
  }, {});

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

  return requiredMaterials;
}

async function createProductionRequest({ productName, quantity, requiredMaterials }) {
  const productionRequestCollection = await getProductionRequestCollection();
  const request = {
    id: uuidv4(),
    productName,
    quantity,
    materials: requiredMaterials,
    status: PRODUCTION_STATUS.REQUESTED,
    createdDate: new Date()
  };
  await productionRequestCollection.insertOne(request);
  return request;
}

async function deductMaterialsAndRecordHistory(requiredMaterials, referenceId) {
  for (const mat of requiredMaterials) {
    await useRawMaterialForProduction({
      rawMaterialId: mat.rawMaterialId,
      quantity: mat.requiredQty,
      referenceId
    });
  }
}

/**
 * Main Functions
 */

/**
 * Raise a production request — deducts materials & records usage history
 */
async function raiseProductionRequest({ productName, quantity }) {
  if (!productName || !quantity || quantity <= 0) {
    throw new Error("Invalid input: productName and quantity are required");
  }

  const formula = await getFormulaByProductName(productName);
  const requiredMaterials = await calculateRequiredMaterials(formula, quantity);
  const request = await createProductionRequest({ productName, quantity, requiredMaterials });
  await deductMaterialsAndRecordHistory(requiredMaterials, request.id);

  return request;
}

/**
 * List all production requests
 */
async function listProductionRequests() {
  const collection = await getProductionRequestCollection();
  return await collection.find().sort({ createdDate: -1 }).toArray();
}

async function updateProductionRequestStatus({ id, newStatus }) {
  const productionCollection = await getProductionRequestCollection();
  const request = await productionCollection.findOne({ id });
  if (!request) throw new Error("Production request not found");

  const currentStatus = request.status;
  const allowedNextStatuses = VALID_STATUS_TRANSITIONS[currentStatus] || [];

  // ❌ Invalid transition
  if (!allowedNextStatuses.includes(newStatus)) {
    throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
  }

  // ✅ Update status
  await productionCollection.updateOne(
    { id },
    { $set: { status: newStatus, updatedDate: new Date() } }
  );

  // ♻️ If CANCELED or DECLINED — restore stock
  if ([PRODUCTION_STATUS.CANCELED, PRODUCTION_STATUS.DECLINED].includes(newStatus)) {
    await restoreRawMaterialsAfterCancel(request);
  }

  return { id, previousStatus: currentStatus, newStatus };
}

module.exports = {
  raiseProductionRequest,
  listProductionRequests,
  updateProductionRequestStatus
};
