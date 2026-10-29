const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service      = require("./smsMarketing.service");

const sendSmsMarketing = catchAsync(async (req, res) => {
  const result = await Service.sendSmsMarketing(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: result.message, data: result });
});

module.exports = { sendSmsMarketing };
