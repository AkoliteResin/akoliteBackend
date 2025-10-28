const {
  raiseProductionRequest,
  listProductionRequests,
  updateProductionRequestStatus
} = require("../services/productionRequest.service");
const { 
  productionRequestSchema,
  updateProductionStatusSchema,
  productionRequestQuerySchema,
 } = require("../validation/productionRequest.validation");

/**
 * POST /production-requests
 */
async function createProductionRequest(req, res) {
  try {
    const { error, value } = productionRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await raiseProductionRequest(value);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * GET /production-requests
 */
async function getAllProductionRequests(req, res) {
  try {
    const { value, error } = productionRequestQuerySchema.validate(req.query, {
      abortEarly: false
    });

    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((d) => d.message)
      });
    }

    const { page, limit, productName, status } = value;
    const result = await listProductionRequests({ page, limit, productName, status });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function  updateRequestStatus (req, res){
  try {
    const { id } = req.params;

    const { error, value } = updateProductionStatusSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const result = await updateProductionRequestStatus({ id, newStatus: value.newStatus });
    res.json({ message: "Production request status updated", data: result });
  } catch (err) {
    console.error("Error updating production status:", err);
    res.status(400).json({ message: err.message });
  }
};

module.exports = {
  createProductionRequest,
  getAllProductionRequests,
  updateRequestStatus
};
