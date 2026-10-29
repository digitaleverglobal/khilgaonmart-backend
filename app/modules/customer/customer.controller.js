const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service = require("./customer.service");
const AdminService = require("./customerAdmin.service");
const RewardService = require("../reward/reward.service");
const ApiError = require("../../../error/ApiError");

const register = catchAsync(async (req, res) => {
  const result = await Service.register(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Customer registered successfully",
    data: result,
  });
});

const login = catchAsync(async (req, res) => {
  const result = await Service.login(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Customer logged in successfully",
    data: result,
  });
});

const getOrders = catchAsync(async (req, res) => {
  const result = await Service.getOrders(req.user, req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Customer orders fetched successfully",
    meta: result.meta,
    data: result.orders,
  });
});

const getProfile = catchAsync(async (req, res) => {
  const result = await Service.getProfile(req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Customer profile fetched successfully",
    data: result,
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const result = await Service.updateProfile(req.user, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

const changePassword = catchAsync(async (req, res) => {
  await Service.changePassword(req.user, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});

const updatePhoto = catchAsync(async (req, res) => {
  const result = await Service.updatePhoto(req.user, req.file);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile photo updated successfully",
    data: result,
  });
});

const removePhoto = catchAsync(async (req, res) => {
  const result = await Service.removePhoto(req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile photo removed successfully",
    data: result,
  });
});

const getRewards = catchAsync(async (req, res) => {
  const result = await RewardService.getCustomerRewards(req.user?.Phone || req.user?.phone);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reward points fetched successfully",
    data: result,
  });
});

// Admin customer list — staff only, not shoppers' own accounts.
const staffOnly = (handler) => catchAsync(async (req, res, next) => {
  if (String(req.user?.role || "").toLowerCase() === "user") {
    throw new ApiError(403, "You are not authorized");
  }
  return handler(req, res, next);
});

const adminList = staffOnly(async (req, res) => {
  const result = await AdminService.listCustomers(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Customers fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const adminGet = staffOnly(async (req, res) => {
  const result = await AdminService.getCustomer(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Customer fetched successfully", data: result });
});

const adminUpdate = staffOnly(async (req, res) => {
  const result = await AdminService.updateCustomer(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Customer updated successfully", data: result });
});

const adminGetRewards = staffOnly(async (req, res) => {
  const customer = await AdminService.getCustomer(req.params.id);
  const result = await RewardService.getCustomerRewards(customer.phone);
  sendResponse(res, { statusCode: 200, success: true, message: "Reward points fetched successfully", data: result });
});

const adminAdjustRewards = staffOnly(async (req, res) => {
  const customer = await AdminService.getCustomer(req.params.id);
  const result = await RewardService.adjustPoints(customer.phone, req.body?.points, req.body?.note, req.user);
  sendResponse(res, { statusCode: 200, success: true, message: "Reward points adjusted", data: result });
});

const adminDelete = staffOnly(async (req, res) => {
  const result = await AdminService.deleteCustomer(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Customer deleted successfully", data: result });
});

module.exports = {
  register, login, getOrders, getProfile, updateProfile, updatePhoto, removePhoto, changePassword,
  getRewards,
  adminList, adminGet, adminUpdate, adminDelete, adminGetRewards, adminAdjustRewards,
};
