const express = require("express");
const router = express.Router();
const {
  addRawMaterial,
  getAllRawMaterials,
  getRawMaterialHistory
} = require("../controllers/rawMaterial.controller");

router.post("/add", addRawMaterial); // add quantity
router.get("/", getAllRawMaterials); // current stock
router.get("/history", getRawMaterialHistory); // history with optional rawMaterialId, page, limit

module.exports = router;
