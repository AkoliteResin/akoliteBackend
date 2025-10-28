const {
  raiseProductionRequest,
  listProductionRequests,
} = require("../services/productionRequest.service");
const { productionRequestSchema } = require("../validation/productionRequest.validation");

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
    const result = await listProductionRequests();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createProductionRequest,
  getAllProductionRequests,
};
