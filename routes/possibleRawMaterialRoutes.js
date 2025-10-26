const express = require("express");
const router = express.Router();
const {
  addPossibleRawMaterial,
  getPossibleRawMaterials,
} = require("../controllers/possibleRawMaterialController");

router.post("/", addPossibleRawMaterial);
router.get("/", getPossibleRawMaterials);

module.exports = router;
