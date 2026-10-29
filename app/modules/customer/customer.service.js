const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const validator = require("validator");
const ApiError = require("../../../error/ApiError");
const { generateToken } = require("../../../helpers/jwtHelpers");
const db = require("../../../models");
const OrderService = require("../order/order.service");
const RewardService = require("../reward/reward.service");

const User = db.user;

const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "").trim();

const toCustomer = (user) => ({
  Id: user.Id,
  name: [user.FirstName, user.LastName].filter(Boolean).join(" ").trim() || user.FirstName || "Customer",
  phone: user.Phone,
  firstName: user.FirstName || "",
  lastName: user.LastName || "",
  image: user.image || null,
});

const register = async ({ name, phone, password, referralCode }) => {
  const normalizedPhone = normalizePhone(phone);
  if (!name || !normalizedPhone || !password) {
    throw new ApiError(400, "Name, phone and password are required");
  }
  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const existing = await User.findOne({
    where: { Phone: normalizedPhone },
  });
  if (existing) throw new ApiError(409, "Customer already exists");

  const nameParts = String(name).trim().split(/\s+/);
  const firstName = nameParts.shift() || name;
  const lastName = nameParts.join(" ");

  const user = await User.create({
    FirstName: firstName,
    LastName: lastName || null,
    Email: null,
    Phone: normalizedPhone,
    Password: password,
    role: "user",
    status: "Active",
  });

  // Sign-up bonus and referral link; never block the account on this.
  await RewardService.handleSignup(normalizedPhone, referralCode, name).catch((error) =>
    console.error("Reward sign-up failed:", error.message),
  );

  return toCustomer(user);
};

const login = async ({ phone, password }) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !password) {
    throw new ApiError(400, "Phone and password are required");
  }

  const user = await User.findOne({
    where: { Phone: normalizedPhone },
  });
  if (!user) throw new ApiError(401, "Invalid phone or password");
  if (user.status === "Inactive") throw new ApiError(403, "This account is deactivated");

  const valid = await bcrypt.compare(password, user.Password);
  if (!valid) throw new ApiError(401, "Invalid phone or password");

  const token = generateToken(user, { customer: true });
  return { token, customer: toCustomer(user) };
};

const toProfile = (user) => ({
  ...toCustomer(user),
  email: user.Email || "",
  address: user.Address || "",
  city: user.City || "",
});

const getOrders = async (user, query = {}) => {
  const phone = normalizePhone(user?.Phone || user?.phone);
  return OrderService.getCustomerOrderHistoryFromDB(phone, {
    page: query.page,
    limit: query.limit,
  });
};

const getProfile = async (user) => {
  const row = await User.findOne({ where: { Id: user.Id } });
  if (!row) throw new ApiError(404, "Customer not found");
  return toProfile(row);
};

// Phone is the login identity and links the customer to their orders, so it is not editable here.
const updateProfile = async (user, { name, email, address, city } = {}) => {
  const row = await User.findOne({ where: { Id: user.Id } });
  if (!row) throw new ApiError(404, "Customer not found");

  const updates = {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, "Name is required");
    const nameParts = trimmed.split(/\s+/);
    updates.FirstName = nameParts.shift().slice(0, 64);
    updates.LastName = nameParts.join(" ").slice(0, 64) || null;
  }

  if (email !== undefined) {
    const trimmed = String(email).trim().toLowerCase();
    if (trimmed && !validator.isEmail(trimmed)) throw new ApiError(400, "Invalid email address");
    if (trimmed) {
      const taken = await User.findOne({
        where: { Email: trimmed, Id: { [Op.ne]: row.Id } },
        paranoid: false,
      });
      if (taken) throw new ApiError(409, "This email is already in use");
    }
    updates.Email = trimmed || null;
  }

  if (address !== undefined) {
    const trimmed = String(address).trim();
    if (trimmed.length > 64) throw new ApiError(400, "Address must be 64 characters or fewer");
    updates.Address = trimmed || null;
  }

  if (city !== undefined) {
    updates.City = String(city).trim().slice(0, 255) || null;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No profile fields were sent");
  }

  await row.update(updates);
  return toProfile(row);
};

// `file` comes from the uploadAvatar middleware, which has already saved it to disk.
const updatePhoto = async (user, file) => {
  if (!file?.path) throw new ApiError(400, "Please choose an image to upload");
  const row = await User.findOne({ where: { Id: user.Id } });
  if (!row) throw new ApiError(404, "Customer not found");
  await row.update({ image: file.path });
  return toProfile(row);
};

const removePhoto = async (user) => {
  const row = await User.findOne({ where: { Id: user.Id } });
  if (!row) throw new ApiError(404, "Customer not found");
  await row.update({ image: null });
  return toProfile(row);
};

const changePassword = async (user, { oldPassword, newPassword }) => {
  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters");
  }

  const row = await User.findOne({ where: { Id: user.Id } });
  if (!row) throw new ApiError(404, "Customer not found");

  const valid = await bcrypt.compare(oldPassword, row.Password);
  if (!valid) throw new ApiError(400, "Old password is incorrect");

  await row.update({ Password: newPassword });
  return { changed: true };
};

module.exports = {
  register, login, getOrders, getProfile, updateProfile, updatePhoto, removePhoto, changePassword,
};
