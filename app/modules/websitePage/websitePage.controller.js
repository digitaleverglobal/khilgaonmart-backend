const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick         = require("../../../shared/pick");
const Service      = require("./websitePage.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await Service.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: "Page created", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, ["searchTerm"]);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await Service.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Pages fetched", meta: result.meta, data: result.data });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await Service.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Page fetched", data: result });
});

const getPublicFromDB = catchAsync(async (req, res) => {
  const result = await Service.getPublicFromDB();
  sendResponse(res, { statusCode: 200, success: true, message: "Public pages fetched", meta: result.meta, data: result.data });
});

const getPublicBySlugFromDB = catchAsync(async (req, res) => {
  const result = await Service.getPublicBySlugFromDB(req.params.slug);
  sendResponse(res, { statusCode: 200, success: true, message: "Public page fetched", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await Service.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Page updated", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await Service.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Page deleted", data: result });
});

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getDataById,
  getPublicFromDB,
  getPublicBySlugFromDB,
  updateOneFromDB,
  deleteIdFromDB,
};
