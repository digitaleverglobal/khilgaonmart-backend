const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const Service = require("./bannerCategory.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await Service.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: "Banner category created", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const result = await Service.getAllFromDB(
    pick(req.query, ["searchTerm"]),
    pick(req.query, ["limit", "page", "sortBy", "sortOrder"]),
  );
  sendResponse(res, { statusCode: 200, success: true, message: "Banner categories fetched", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await Service.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Banner category list fetched", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await Service.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Banner category fetched", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Banner category updated", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await Service.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Banner category deleted", data: result });
});

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getAllFromDBWithoutQuery,
  getDataById,
  updateOneFromDB,
  deleteIdFromDB,
};
