const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const RolePermissionService = require("./rolePermission.service");

const getAllRolePermissions = catchAsync(async (req, res) => {
  const result = await RolePermissionService.getAllRolePermissions();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Role permissions fetched successfully",
    data: result,
  });
});

const getAvailableMenuPermissions = catchAsync(async (req, res) => {
  const result = RolePermissionService.getAvailableMenuPermissions();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Available menu permissions fetched successfully",
    data: result,
  });
});

const getRolePermissionByRole = catchAsync(async (req, res) => {
  const result = await RolePermissionService.getRolePermissionByRole(
    req.params.role,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Role permission fetched successfully",
    data: result,
  });
});

const createRolePermissions = catchAsync(async (req, res) => {
  const result = await RolePermissionService.createRolePermissions(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Role created successfully",
    data: result,
  });
});

const updateRolePermissions = catchAsync(async (req, res) => {
  const result = await RolePermissionService.updateRolePermissions(
    req.params.role,
    req.body.menuPermissions,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Role permissions updated successfully",
    data: result,
  });
});

const deleteRolePermissions = catchAsync(async (req, res) => {
  const result = await RolePermissionService.deleteRolePermissions(req.params.role);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Role deleted successfully",
    data: result,
  });
});

module.exports = {
  getAllRolePermissions,
  getAvailableMenuPermissions,
  getRolePermissionByRole,
  createRolePermissions,
  updateRolePermissions,
  deleteRolePermissions,
};
