const express = require("express");
const router = express.Router();
const {
  createProductionRequest,
  getAllProductionRequests,
  updateRequestStatus,
} = require("../controllers/productionRequest.controller");

router.post("/", createProductionRequest);
router.get("/", getAllProductionRequests);
router.patch("/:id/status", updateRequestStatus);

module.exports = router;
