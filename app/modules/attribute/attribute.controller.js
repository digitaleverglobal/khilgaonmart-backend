const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const { AttributeFilterAbleFileds } = require("./attribute.constants");
const AttributeService = require("./attribute.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await AttributeService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Attribute created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, AttributeFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await AttributeService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Attributes fetched!", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await AttributeService.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Attributes fetched!", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await AttributeService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Attribute fetched!", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await AttributeService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Attribute updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await AttributeService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Attribute deleted!", data: result });
});

const AttributeController = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = AttributeController;
