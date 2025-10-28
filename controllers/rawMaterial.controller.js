// controllers/rawMaterial.controller.js
const {
  addRawMaterialSchema,
  getRawMaterialHistorySchema
} = require("../validation/rawMaterial.validation");
const {
  addRawMaterialStock,
  listAllRawMaterials,
  getRawMaterialHistory
} = require("../services/rawMaterial.service");

exports.addRawMaterial = async (req, res) => {
  try {
    const { error, value } = addRawMaterialSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const added = await addRawMaterialStock(value);
    res.status(201).json({ message: "Raw material added", data: added });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
};

exports.getAllRawMaterials = async (req, res) => {
  try {
    const data = await listAllRawMaterials();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getRawMaterialHistory = async (req, res) => {
  try {
    const { error, value } = getRawMaterialHistorySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map(d => d.message)
      });
    }

    const { rawMaterialId, actionType, page, limit } = value;

    const data = await getRawMaterialHistory({
      rawMaterialId,
      actionType,
      page,
      limit
    });

    res.json(data);
  } catch (err) {
    console.error("Error fetching raw material history:", err);
    res.status(500).json({ message: "Server error" });
  }
};
