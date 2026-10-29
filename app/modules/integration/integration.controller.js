const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service = require("./integration.service");

const receiveWooCommerceOrder = catchAsync(async (req, res) => {
  const result = await Service.receiveWooCommerceOrder(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.duplicate
      ? "WooCommerce order already exists"
      : "WooCommerce order received successfully",
    data: result,
  });
});

const receiveWooCommerceProduct = catchAsync(async (req, res) => {
  const result = await Service.receiveWooCommerceProduct(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "WooCommerce product received successfully",
    data: result,
  });
});

const test = catchAsync(async (req, res) =>
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Integration test successful",
    data: await Service.testConfiguration(req.params.type, req.body.provider, req.body.config || req.body.data),
  }),
);

module.exports = { receiveWooCommerceOrder, receiveWooCommerceProduct, test };
