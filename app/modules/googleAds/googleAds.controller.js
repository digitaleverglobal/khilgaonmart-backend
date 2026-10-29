const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const Service = require("./googleAds.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await Service.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: "Google Ads config created", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const result = await Service.getAllFromDB(
    pick(req.query, ["searchTerm"]),
    pick(req.query, ["limit", "page", "sortBy", "sortOrder"]),
  );
  sendResponse(res, { statusCode: 200, success: true, message: "Google Ads configs fetched", meta: result.meta, data: result.data });
});

const getPublicFromDB = catchAsync(async (req, res) => {
  const result = await Service.getPublicFromDB();
  sendResponse(res, { statusCode: 200, success: true, message: "Public Google Ads configs fetched", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Google Ads config updated", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await Service.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Google Ads config deleted", data: result });
});

module.exports = { insertIntoDB, getAllFromDB, getPublicFromDB, updateOneFromDB, deleteIdFromDB };
