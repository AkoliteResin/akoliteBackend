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

const productionRequestQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  productName: Joi.string().trim().optional(),
  status: Joi.string()
    .valid(...allStatuses)
    .optional()
    .messages({
      "any.only": `Invalid status. Allowed values: ${allStatuses.join(", ")}`,
      "string.base": "Status must be a string",
    }),
});

module.exports = {
  productionRequestSchema,
  updateProductionStatusSchema,
  productionRequestQuerySchema,
};
