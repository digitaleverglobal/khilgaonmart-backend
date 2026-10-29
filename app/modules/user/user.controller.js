const catchAsync = require("../../../shared/catchAsync");
const pick = require("../../../shared/pick");
const sendResponse = require("../../../shared/sendResponse");
const { UserFilterAbleFileds } = require("./user.constants");
const UserService = require("./user.service");
// const { UserService } = require("./user.service");
const bcrypt = require("bcryptjs");
const { createUserLogHistory } = require("../../utils/userLogHistory");

const getUploadedDocumentPath = (files, fieldName) =>
  files?.[fieldName]?.[0]?.path;

const login = catchAsync(async (req, res) => {
  try {
    const result = await UserService.login(req.body);
    await createUserLogHistory({
      req,
      user: result.user,
      action: "login",
      statusCode: 200,
      responseMessage: "User login successfully!!",
    });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "User login successfully!!",
      data: result,
    });
  } catch (error) {
    await createUserLogHistory({
      req,
      user: null,
      action: "failed_login",
      statusCode: error.statusCode || 401,
      status: "failed",
      responseMessage: error.message || "Login failed",
      metadata: {
        email: req.body?.Email || null,
      },
    });

    throw error;
  }
});

const register = catchAsync(async (req, res) => {
  const {
    FirstName,
    LastName,
    Email,
    Password,
    Address,
    Phone,
    City,
    PostalCode,
    Country,
    role,
    status,
  } = req.body;

  const data = {
    FirstName,
    LastName,
    Email,
    Password,
    Address,
    Phone,
    City,
    PostalCode,
    Country,
    role,
    status,
    image: getUploadedDocumentPath(req.files, "image"),
    idCard: getUploadedDocumentPath(req.files, "idCard"),
    cv: getUploadedDocumentPath(req.files, "cv"),
    guardianPhoto: getUploadedDocumentPath(req.files, "guardianPhoto"),
    guardianIdCard: getUploadedDocumentPath(req.files, "guardianIdCard"),
  };
  const result = await UserService.register(data);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User register successfully!!",
    data: result,
  });
});

const logout = catchAsync(async (req, res) => {
  await createUserLogHistory({
    req,
    user: req.user,
    action: "logout",
    statusCode: 200,
    responseMessage: "User logout successfully!!",
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User logout successfully!!",
    data: null,
  });
});

const getAllUserFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, UserFilterAbleFileds);

  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

  const result = await UserService.getAllUserFromDB(filters, options);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User data fetched!!",
    meta: result.meta,
    data: result.data,
  });
});

const getUserById = catchAsync(async (req, res) => {
  const result = await UserService.getUserById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User data fetched!!",
    data: result,
  });
});

const updateUserFromDB = catchAsync(async (req, res) => {
  const { id } = req.params;
  const callerRole = req.user?.role;
  const { ENUM_USER_ROLE } = require("../../enums/user");

  const isAdmin = [
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
  ].includes(callerRole);

  const {
    FirstName,
    LastName,
    Email,
    Password,
    Address,
    Phone,
    City,
    PostalCode,
    Country,
    role,
    status,
  } = req.body;

  let newPassword;
  if (Password && Password.trim() !== "") {
    const salt = await bcrypt.genSalt(12);
    newPassword = await bcrypt.hash(Password, salt);
  }

  const data = {
    FirstName,
    LastName,
    Email,
    Password: newPassword,
    Address,
    Phone,
    City,
    PostalCode,
    Country,
    // Only admins can change a user's role — prevent privilege escalation
    ...(isAdmin && role ? { role } : {}),
    // Status changes are restricted to super admin, matching the status endpoint.
    ...(callerRole === ENUM_USER_ROLE.SUPER_ADMIN && status ? { status } : {}),
    image: getUploadedDocumentPath(req.files, "image"),
    idCard: getUploadedDocumentPath(req.files, "idCard"),
    cv: getUploadedDocumentPath(req.files, "cv"),
    guardianPhoto: getUploadedDocumentPath(req.files, "guardianPhoto"),
    guardianIdCard: getUploadedDocumentPath(req.files, "guardianIdCard"),
  };

  const result = await UserService.updateUserFromDB(id, data, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User update successfully!!",
    data: result,
  });
});

const deleteUserFromDB = catchAsync(async (req, res) => {
  const result = await UserService.deleteIdFromDB(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User delete successfully!!",
    data: result,
  });
});

const updateUserOrderDistribution = catchAsync(async (req, res) => {
  const result = await UserService.updateUserOrderDistributionFromDB(
    req.params.id,
    req.body.enabled === true || req.body.enabled === "true",
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order distribution updated successfully!!",
    data: result,
  });
});

const updateUserStatusFromDB = catchAsync(async (req, res) => {
  const result = await UserService.updateUserStatusFromDB(
    req.user,
    req.params.id,
    req.body.status,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User status updated successfully!!",
    data: result,
  });
});

const impersonateUser = catchAsync(async (req, res) => {
  const result = await UserService.impersonateUserSession(
    req.user,
    req.params.id,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User impersonation successful!!",
    data: result,
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;
  const result = await UserService.refreshToken(token);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Token refreshed successfully",
    data: result,
  });
});

const UserController = {
  getAllUserFromDB,
  login,
  logout,
  register,
  refreshToken,
  getUserById,
  updateUserFromDB,
  deleteUserFromDB,
  updateUserStatusFromDB,
  updateUserOrderDistribution,
  impersonateUser,
};

module.exports = UserController;
