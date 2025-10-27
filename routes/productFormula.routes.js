const express = require("express");
const router = express.Router();
const {
  createProductFormula,
  listProductFormulas,
  deleteProductFormula,
} = require("../controllers/productFormula.controller");

// Create a product formula
router.post("/", createProductFormula);

// List all product formulas
router.get("/", listProductFormulas);

// Delete a product formula by ID
router.delete("/:id", deleteProductFormula);

module.exports = router;
