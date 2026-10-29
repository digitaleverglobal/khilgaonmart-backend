const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service      = require("./visitorStat.service");
const { getClientIp } = require("../../utils/clientIp");

const track    = catchAsync(async (req, res) => { const ip = getClientIp(req); const r = await Service.track(ip); sendResponse(res, { statusCode: 200, success: true, message: "Tracked", data: r }); });
const getStats = catchAsync(async (req, res) => { const r = await Service.getStats(); sendResponse(res, { statusCode: 200, success: true, message: "Stats fetched", data: r }); });

module.exports = { track, getStats };
