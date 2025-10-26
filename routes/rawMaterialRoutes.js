const express = require("express");
const router = express.Router();
const {
  addRawMaterial,
  getAllRawMaterials,
  getRawMaterialHistory
} = require("../controllers/rawMaterialController");

router.post("/add", addRawMaterial); // add quantity
router.get("/", getAllRawMaterials); // current stock
router.get("/history", getRawMaterialHistory); // history with optional rawMaterialId, page, limit

module.exports = router;
