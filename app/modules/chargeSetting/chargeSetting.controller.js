const catchAsync = require("../../../shared/catchAsync");
const pick = require("../../../shared/pick");
const sendResponse = require("../../../shared/sendResponse");
const ChargeSettingService = require("./chargeSetting.service");

const createChargeSetting = catchAsync(async (req, res) => {
  const result = await ChargeSettingService.createChargeSetting(
    req.body,
    req.user,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Charge setting created successfully",
    data: result,
  });
});

const getChargeSettings = catchAsync(async (req, res) => {
  const filters = pick(req.query, ["chargeType", "status", "searchTerm"]);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await ChargeSettingService.getChargeSettings(filters, options);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Charge settings fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getPublicChargeSettings = catchAsync(async (req, res) => {
  const filters = pick(req.query, ["chargeType", "searchTerm"]);
  const result = await ChargeSettingService.getChargeSettings(filters, {
    page: 1,
    limit: 100,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Public charge settings fetched successfully",
    data: result.data,
  });
});

const updateChargeSetting = catchAsync(async (req, res) => {
  const result = await ChargeSettingService.updateChargeSetting(
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Charge setting updated successfully",
    data: result,
  });
});

const deleteChargeSetting = catchAsync(async (req, res) => {
  const result = await ChargeSettingService.deleteChargeSetting(
    req.params.id,
    req.query.chargeType || req.body?.chargeType,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Charge setting deleted successfully",
    data: result,
  });
});

module.exports = {
  createChargeSetting,
  getChargeSettings,
  getPublicChargeSettings,
  updateChargeSetting,
  deleteChargeSetting,
};
