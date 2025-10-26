const {
  createPossibleRawMaterial,
  listPossibleRawMaterials,
} = require("../models/possibleRawMaterial.model");

exports.addPossibleRawMaterial = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const created = await createPossibleRawMaterial({ name });
    return res.status(201).json({ message: "Created", data: created });
  } catch (err) {
    console.error("POST /possible-raw-materials error:", err.message || err);
    return res.status(400).json({ message: err.message || "Server error" });
  }
};

exports.getPossibleRawMaterials = async (req, res) => {
  try {
    const list = await listPossibleRawMaterials();
    return res.json(list);
  } catch (err) {
    console.error("GET /possible-raw-materials error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
