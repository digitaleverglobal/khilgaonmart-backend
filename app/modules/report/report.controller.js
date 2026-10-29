const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service = require("./report.service");
module.exports = {
  getReport: catchAsync(async (req, res) => sendResponse(res, { statusCode: 200, success: true, message: "Report fetched", data: await Service.getReport(req.params.type, req.query) })),
  getOptions: catchAsync(async (_req, res) => sendResponse(res, { statusCode: 200, success: true, message: "Report options fetched", data: await Service.getOptions() })),
};
