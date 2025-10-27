const Joi = require("joi");

const possibleRawMaterialSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
});

module.exports = { possibleRawMaterialSchema };
