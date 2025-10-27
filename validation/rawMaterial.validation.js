const Joi = require("joi");

const addRawMaterialSchema = Joi.object({
  rawMaterialId: Joi.string().uuid().required(),
  quantity: Joi.number().positive().required(),
  receivedDate: Joi.date().optional()
});

module.exports = { addRawMaterialSchema };
