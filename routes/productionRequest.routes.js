const express = require("express");
const router = express.Router();
const {
  createProductionRequest,
  getAllProductionRequests,
} = require("../controllers/productionRequest.controller");

router.post("/", createProductionRequest);
router.get("/", getAllProductionRequests);

module.exports = router;
