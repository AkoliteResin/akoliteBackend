const Joi = require("joi");
const { PRODUCTION_STATUS } = require("../config/constants");

const allStatuses = Object.values(PRODUCTION_STATUS);

const productionRequestSchema = Joi.object({
  productName: Joi.string().trim().required().messages({
    "string.empty": "Product name is required",
    "any.required": "Product name is required",
  }),
  quantity: Joi.number().positive().required().messages({
    "number.base": "Quantity must be a number",
    "number.positive": "Quantity must be greater than 0",
    "any.required": "Quantity is required",
  }),
});

const updateProductionStatusSchema = Joi.object({
  newStatus: Joi.string()
    .valid(...allStatuses) 
    .required()
    .messages({
      "any.required": "newStatus is required",
      "any.only": `newStatus must be one of: ${allStatuses.join(", ")}`,
    }),
});

module.exports = {
  productionRequestSchema,
  updateProductionStatusSchema,
};
