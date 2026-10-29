const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const { getDashboardStats } = require("./dashboard.service");

const getStats = catchAsync(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const result = await getDashboardStats({ fromDate, toDate }, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Dashboard stats fetched successfully",
    data: result,
  });
});

module.exports = { getStats };
