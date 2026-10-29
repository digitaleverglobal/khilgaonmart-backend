const { where, Op } = require("sequelize");
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../../../helpers/jwtHelpers");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const User = db.user;
const Sale = db.sale;
const bcrypt = require("bcryptjs");
const ApiError = require("../../../error/ApiError");
const { UserSearchableFields } = require("./user.constants");
const sendEmail = require("../../middlewares/sendEmail");
const welcomeCredentialsTemplate = require("../../utils/emailTemplates/welcomeCredentials");
const RolePermissionService = require("../rolePermission/rolePermission.service");
const { ENUM_USER_ROLE } = require("../../enums/user");
const generateRandomPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "").trim();
  if (/^1\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
};

const sanitizeUser = (user) => {
  if (!user) return null;

  const plainUser = typeof user.get === "function" ? user.get({ plain: true }) : user;
  delete plainUser.Password;
  return plainUser;
};

const login = async (buyerData) => {
  const { Email, Password } = buyerData;
  // console.log(buyerData);

  // Validate request data
  if (!Email || !Password) {
    throw new ApiError();
  }

  // Generic error to prevent user enumeration
  const user = await User.findOne({ where: { Email } });
  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  if (user.status === "Inactive") {
    throw new ApiError(403, "This account is deactivated. Please contact the administrator.");
  }

  const isPasswordValid = bcrypt.compareSync(Password, user.Password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  const plainUser = sanitizeUser(user);

  const menuPermissions =
    await RolePermissionService.getEffectiveMenuPermissions(user.role);

  return {
    accessToken,
    refreshToken,
    user: plainUser,
    menuPermissions,
  };
};

// const register = async (userData) => {
//   const { Email } = userData;

//   const isUserExist = await User.findOne({
//     where: { Email: Email },
//   });

//   if (isUserExist) {
//     throw new ApiError(409, "User already exist");
//   }

//   const result = await User.create(userData);

//   return result;
// };

const register = async (userData) => {
  const { Email, Password, Name } = userData;
  const Phone = normalizePhone(userData.Phone);
  if (!Phone) {
    throw new ApiError(400, "Phone is required");
  }

  const plainPassword =
    typeof Password === "string" && Password.trim()
      ? Password
      : generateRandomPassword();

  if (Email) {
    const isUserExist = await User.findOne({ where: { Email } });
    if (isUserExist) throw new ApiError(409, "User already exist");
  }
  if (userData.role) {
    await RolePermissionService.ensureRoleExists(userData.role);
  }

  // ✅ user create
  const result = await User.create({
    ...userData,
    Phone,
    Password: plainPassword,
  });

  if (Email) {
    // ✅ send email after success
    const htmlContent = welcomeCredentialsTemplate({
      name: Name || "User",
      email: Email,
      password: plainPassword,
      loginUrl: process.env.APP_LOGIN_URL,
      brandName: process.env.MAIL_BRAND_NAME,
    });

    const sent = await sendEmail({
      to: Email,
      subject: "Your Accounts Software Credentials",
      htmlContent,
    });

    // optional: email fail হলে log/handle
    if (!sent) {
      console.log("⚠️ User created but email not sent:", Email);
    }
  }

  return result;
};

const getAllUserFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);

  const { searchTerm, ...filterData } = filters;

  const andConditions = [];

  // ✅ Search (OR across multiple columns)
  if (searchTerm) {
    andConditions.push({
      [Op.or]: UserSearchableFields.map((field) => ({
        [field]: { [Op.like]: `%${searchTerm}%` }, // Postgres হলে Op.iLike
      })),
    });
  }

  // ✅ Exact filters (role, City etc)
  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      [Op.and]: Object.entries(filterData).map(([key, value]) => ({
        [key]: value,
      })),
    });
  }

  andConditions.push({
    deletedAt: { [Op.is]: null }, // Only include records with deletedAt as null (not deleted)
  });

  const whereConditions =
    andConditions.length > 0 ? { [Op.and]: andConditions } : {};

  const result = await User.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    attributes: { exclude: ["Password"] }, // ✅ important
    order:
      options.sortBy && options.sortOrder
        ? [[options.sortBy, options.sortOrder]]
        : [["createdAt", "DESC"]],
  });

  const count = await User.count({ where: whereConditions });

  return {
    meta: { count, page, limit },
    data: result,
  };
};

const getUserById = async (id) => {
  const result = await User.findOne({
    where: {
      Id: id,
    },
    attributes: { exclude: ["Password"] },
  });

  return result;
};

const deleteUserFromDB = async (id) => {
  const result = await User.destroy({
    where: {
      Id: id,
    },
  });

  return result;
};

const updateUserFromDB = async (id, payload, actor = null) => {
  const existing = await User.findOne({
    where: { Id: id },
  });

  if (!existing) {
    throw new ApiError(404, "User not found");
  }
  if (payload.role) {
    await RolePermissionService.ensureRoleExists(payload.role);
  }
  if (payload.status) {
    const normalizedStatus = String(payload.status).trim().toLowerCase();
    if (!['active', 'inactive'].includes(normalizedStatus)) {
      throw new ApiError(400, 'Invalid status value');
    }
    payload.status = normalizedStatus === 'active' ? 'Active' : 'Inactive';
    if (actor?.Id === Number(id) && payload.status === 'Inactive') {
      throw new ApiError(400, 'You cannot deactivate your own account');
    }
  }

  await User.update(payload, {
    where: {
      Id: id,
    },
  });

  return getUserById(id);
};

const updateUserStatusFromDB = async (actor, id, status) => {
  const allowedStatuses = ["Active", "Inactive"];
  if (!allowedStatuses.includes(status)) {
    throw new ApiError(400, "Invalid status value");
  }

  if (actor?.Id === Number(id) && status === "Inactive") {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  const user = await User.findOne({
    where: { Id: id },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  await user.update({ status });
  return sanitizeUser(user);
};

const updateUserOrderDistributionFromDB = async (id, enabled) => {
  const user = await User.findOne({ where: { Id: id } });
  if (!user) throw new ApiError(404, "User not found");
  await user.update({ orderDistribution: Boolean(enabled) });
  return sanitizeUser(user);
};

const impersonateUserSession = async (actor, id) => {
  if (actor?.role !== ENUM_USER_ROLE.SUPER_ADMIN) {
    throw new ApiError(403, "Only super admin can use login as user");
  }

  const user = await User.findOne({
    where: { Id: id },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const accessToken = generateToken(user, {
    isImpersonation: true,
    impersonatedById: actor.Id,
    impersonatedByRole: actor.role,
  });

  const plainUser = sanitizeUser(user);
  const menuPermissions =
    await RolePermissionService.getEffectiveMenuPermissions(user.role);

  return {
    accessToken,
    user: plainUser,
    menuPermissions,
    impersonation: {
      actorId: actor.Id,
      actorRole: actor.role,
    },
  };
};

const refreshToken = async (token) => {
  if (!token) throw new ApiError(401, "Refresh token is required");

  const decoded = verifyRefreshToken(token);

  const user = await User.findOne({ where: { Id: decoded.Id } });
  if (!user) throw new ApiError(401, "User not found");

  if (user.status === "Inactive") {
    throw new ApiError(403, "This account is deactivated");
  }

  const newAccessToken = generateToken(user);
  const plainUser = sanitizeUser(user);
  const menuPermissions =
    await RolePermissionService.getEffectiveMenuPermissions(user.role);

  return {
    accessToken: newAccessToken,
    user: plainUser,
    menuPermissions,
  };
};

const UserService = {
  getAllUserFromDB,
  login,
  register,
  refreshToken,
  deleteUserFromDB,
  updateUserFromDB,
  getUserById,
  updateUserStatusFromDB,
  updateUserOrderDistributionFromDB,
  impersonateUserSession,
};

module.exports = UserService;
