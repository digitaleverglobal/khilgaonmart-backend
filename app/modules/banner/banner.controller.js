const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const Service = require("./banner.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await Service.insertIntoDB(req.body, req.file);
  sendResponse(res, { statusCode: 201, success: true, message: "Banner created", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const result = await Service.getAllFromDB(
    pick(req.query, ["searchTerm"]),
    pick(req.query, ["limit", "page", "sortBy", "sortOrder"]),
  );
  sendResponse(res, { statusCode: 200, success: true, message: "Banners fetched", meta: result.meta, data: result.data });
});

const getPublicFromDB = catchAsync(async (req, res) => {
  const result = await Service.getPublicFromDB();
  sendResponse(res, { statusCode: 200, success: true, message: "Public banners fetched", data: result });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await Service.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Banner fetched", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.updateOneFromDB(req.params.id, req.body, req.file);
  sendResponse(res, { statusCode: 200, success: true, message: "Banner updated", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await Service.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Banner deleted", data: result });
});

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getPublicFromDB,
  getDataById,
  updateOneFromDB,
  deleteIdFromDB,
};
