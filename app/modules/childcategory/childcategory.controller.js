const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const { ChildcategoryFilterAbleFileds } = require("./childcategory.constants");
const ChildcategoryService = require("./childcategory.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await ChildcategoryService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Child category created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, ChildcategoryFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await ChildcategoryService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Child categories fetched!", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await ChildcategoryService.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Child categories fetched!", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await ChildcategoryService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Child category fetched!", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await ChildcategoryService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Child category updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await ChildcategoryService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Child category deleted!", data: result });
});

const ChildcategoryController = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = ChildcategoryController;
