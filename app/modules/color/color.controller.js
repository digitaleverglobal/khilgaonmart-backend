const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const { ColorFilterAbleFileds } = require("./color.constants");
const ColorService = require("./color.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await ColorService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Color created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, ColorFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await ColorService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Colors fetched!", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await ColorService.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Colors fetched!", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await ColorService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Color fetched!", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await ColorService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Color updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await ColorService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Color deleted!", data: result });
});

const ColorController = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = ColorController;
