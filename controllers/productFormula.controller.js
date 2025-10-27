const { productFormulaSchema } = require("../validation/productFormula.validation");
const {
  createProductFormulaService,
  listProductFormulasService,
  deleteProductFormulaService,
} = require("../services/productFormula.service");

/**
 * Create a new product formula
 */
async function createProductFormula(req, res) {
  try {
    const { error, value } = productFormulaSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const result = await createProductFormulaService(value);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * List all product formulas
 */
async function listProductFormulas(req, res) {
  try {
    const result = await listProductFormulasService();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Delete a formula by ID
 */
async function deleteProductFormula(req, res) {
  try {
    const deleted = await deleteProductFormulaService(req.params.id);
    if (!deleted)
      return res.status(404).json({ success: false, message: "Formula not found" });

    res.status(200).json({ success: true, message: "Formula deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createProductFormula,
  listProductFormulas,
  deleteProductFormula,
};
