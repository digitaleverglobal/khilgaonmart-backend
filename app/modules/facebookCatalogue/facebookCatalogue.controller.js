const catchAsync   = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service      = require("./facebookCatalogue.service");

const getFeed = catchAsync(async (req, res) => {
  const { xml, count } = await Service.generateFeed();
  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
});

const refresh = catchAsync(async (req, res) => {
  const { count } = await Service.generateFeed();
  sendResponse(res, { statusCode: 200, success: true, message: `Product feed refreshed with ${count} product(s).`, data: { count } });
});

module.exports = { getFeed, refresh };
