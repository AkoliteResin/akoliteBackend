// models/RawMaterial.js
class RawMaterial {
  constructor({ name, totalQuantity = 0, updatedAt = new Date() }) {
    if (!name) throw new Error("Raw material name is required");

    this.name = name;
    this.totalQuantity = totalQuantity;
    this.updatedAt = updatedAt;
  }
}

module.exports = RawMaterial;