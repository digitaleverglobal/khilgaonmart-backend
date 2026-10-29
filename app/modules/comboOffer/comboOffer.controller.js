const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const ApiError = require("../../../error/ApiError");
const ComboOfferService = require("./comboOffer.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await ComboOfferService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offer created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, ["searchTerm", "status"]);
  const options = pick(req.query, ["limit", "page"]);
  const result = await ComboOfferService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offers fetched!", meta: result.meta, data: result.data });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await ComboOfferService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offer fetched!", data: result });
});

const getPublicCombos = catchAsync(async (req, res) => {
  const result = await ComboOfferService.getPublicCombos();
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offers fetched!", data: result });
});

const getPublicComboById = catchAsync(async (req, res) => {
  const result = await ComboOfferService.getPublicComboById(req.params.id);
  if (!result) throw new ApiError(404, "Combo offer not found");
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offer fetched!", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await ComboOfferService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offer updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await ComboOfferService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Combo offer deleted!", data: result });
});

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getDataById,
  getPublicCombos,
  getPublicComboById,
  updateOneFromDB,
  deleteIdFromDB,
};
