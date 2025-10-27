const Joi = require("joi");

const productFormulaSchema = Joi.object({
  name: Joi.string().trim().required(),
  raw_materials: Joi.array()
    .items(
      Joi.object({
        raw_material_id: Joi.string().uuid().required(),
        percentage: Joi.number().min(0).max(100).required(),
      })
    )
    .min(1)
    .required(),
});

module.exports = { productFormulaSchema };
