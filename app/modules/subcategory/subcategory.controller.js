const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const { SubcategoryFilterAbleFileds } = require("./subcategory.constants");
const SubcategoryService = require("./subcategory.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await SubcategoryService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Subcategory created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, SubcategoryFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await SubcategoryService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Subcategories fetched!", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await SubcategoryService.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Subcategories fetched!", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await SubcategoryService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Subcategory fetched!", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await SubcategoryService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Subcategory updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await SubcategoryService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Subcategory deleted!", data: result });
});

const SubcategoryController = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = SubcategoryController;
