const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const { BrandFilterAbleFileds } = require("./brand.constants");
const BrandService = require("./brand.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await BrandService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Brand created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, BrandFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await BrandService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Brands fetched!", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await BrandService.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Brands fetched!", data: result });
});

const getPublicBrands = catchAsync(async (req, res) => {
  const result = await BrandService.getPublicBrands();
  sendResponse(res, { statusCode: 200, success: true, message: "Public brands fetched!", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await BrandService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Brand fetched!", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await BrandService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Brand updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await BrandService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Brand deleted!", data: result });
});

const BrandController = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getPublicBrands, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = BrandController;
