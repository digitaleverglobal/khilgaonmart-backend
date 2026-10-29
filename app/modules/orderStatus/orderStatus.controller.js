const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick         = require("../../../shared/pick");
const Service      = require("./orderStatus.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await Service.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: "Order status created", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, ["searchTerm"]);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await Service.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Order statuses fetched", meta: result.meta, data: result.data });
});

const getPublicFromDB = catchAsync(async (req, res) => {
  const result = await Service.getPublicFromDB();
  sendResponse(res, { statusCode: 200, success: true, message: "Public order statuses fetched", meta: result.meta, data: result.data });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Order status updated", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await Service.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Order status deleted", data: result });
});

module.exports = { insertIntoDB, getAllFromDB, getPublicFromDB, updateOneFromDB, deleteIdFromDB };
