const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service = require("./tracking.service");

const getPublicConfig = catchAsync(async (req, res) => {
  const result = await Service.getPublicConfig();
  sendResponse(res, { statusCode: 200, success: true, message: "Tracking config fetched", data: result });
});

const trackEvent = catchAsync(async (req, res) => {
  const result = await Service.trackEvent(req.body, req);
  sendResponse(res, { statusCode: 200, success: true, message: "Tracking event processed", data: result });
});

module.exports = { getPublicConfig, trackEvent };
