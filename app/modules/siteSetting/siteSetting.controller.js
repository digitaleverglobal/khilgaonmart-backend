const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service      = require("./siteSetting.service");

const getByType = catchAsync(async (req, res) => {
  const result = await Service.getByType(req.params.settingType);
  sendResponse(res, { statusCode: 200, success: true, message: "Setting fetched", data: result });
});

const getPublic = catchAsync(async (req, res) => {
  const result = await Service.getPublic();
  sendResponse(res, { statusCode: 200, success: true, message: "Public settings fetched", data: result });
});

const upsert = catchAsync(async (req, res) => {
  const result = await Service.upsert(req.params.settingType, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Setting saved", data: result });
});

module.exports = { getByType, getPublic, upsert };
