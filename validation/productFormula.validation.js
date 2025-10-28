const Joi = require("joi");

const productFormulaSchema = Joi.object({
  name: Joi.string().trim().required(),
  rawMaterials: Joi.array()
    .items(
      Joi.object({
        rawMaterialId: Joi.string().uuid().required(),
        percentage: Joi.number().min(0).max(100).required(),
      })
    )
    .min(1)
    .required()
    .custom((arr, helpers) => {
      const total = arr.reduce((sum, r) => sum + r.percentage, 0);
      if (Math.abs(total - 100) > 0.5) {
        return helpers.message(
          `Total percentage must be approximately 100 (currently ${total.toFixed(2)})`
        );
      }
      return arr;
    }, "Total percentage validation"),
});

module.exports = { productFormulaSchema };
