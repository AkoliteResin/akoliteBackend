// controllers/rawMaterial.controller.js
const { addRawMaterialSchema } = require("../validation/rawMaterial.validation");
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
    const { rawMaterialId, page = 1, limit = 10 } = req.query;
    const data = await getRawMaterialHistory({ rawMaterialId, page: Number(page), limit: Number(limit) });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
