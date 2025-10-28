const Joi = require("joi");
const { HISTORY_ACTION_TYPES } = require("../config/constants");

const addRawMaterialSchema = Joi.object({
  rawMaterialId: Joi.string().uuid().required(),
  quantity: Joi.number().positive().required(),
  receivedDate: Joi.date().optional()
});

const getRawMaterialHistorySchema = Joi.object({
  rawMaterialId: Joi.string().optional(),
  actionType: Joi.string()
    .valid(...Object.values(HISTORY_ACTION_TYPES))
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

module.exports = { addRawMaterialSchema, getRawMaterialHistorySchema };
