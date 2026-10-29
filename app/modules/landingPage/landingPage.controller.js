const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const Service = require("./landingPage.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await Service.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: "Landing page created", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const result = await Service.getAllFromDB(
    pick(req.query, ["searchTerm"]),
    pick(req.query, ["limit", "page", "sortBy", "sortOrder"]),
  );
  sendResponse(res, { statusCode: 200, success: true, message: "Landing pages fetched", meta: result.meta, data: result.data });
});

const getOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.getOneFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Landing page fetched", data: result });
});

const getPublicOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.getPublicOneFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Landing page fetched", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Landing page updated", data: result });
});

const duplicateIntoDB = catchAsync(async (req, res) => {
  const result = await Service.duplicateIntoDB(req.params.id);
  sendResponse(res, { statusCode: 201, success: true, message: "Landing page duplicated", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await Service.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Landing page deleted", data: result });
});

const getHeaderFromDB = catchAsync(async (req, res) => {
  const result = await Service.getHeaderFromDB();
  sendResponse(res, { statusCode: 200, success: true, message: "Landing page header fetched", data: result });
});

const getFooterFromDB = catchAsync(async (req, res) => {
  const result = await Service.getFooterFromDB();
  sendResponse(res, { statusCode: 200, success: true, message: "Landing page footer fetched", data: result });
});

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getOneFromDB,
  getPublicOneFromDB,
  updateOneFromDB,
  duplicateIntoDB,
  deleteIdFromDB,
  getHeaderFromDB,
  getFooterFromDB,
};
