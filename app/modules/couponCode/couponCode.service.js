const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const M = () => db.couponCode;

const normalizeCode = (code) => String(code || "").trim().toUpperCase();

const parseAmount = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const normalizeStatus = (status) => {
  const value = String(status || "Active").trim().toLowerCase();
  return value === "inactive" ? "Inactive" : "Active";
};

const normalizeType = (type) => {
  const value = String(type || "Percentage").trim().toLowerCase();
  return value.startsWith("fixed") ? "Fixed" : "Percentage";
};

const normalizePayload = (data = {}) => ({
  ...data,
  code: normalizeCode(data.code),
  type: normalizeType(data.type),
  amount: parseAmount(data.amount),
  buyAmount: parseAmount(data.buyAmount),
  status: normalizeStatus(data.status),
});

const insertIntoDB = async (data) => {
  const payload = normalizePayload(data);
  if (!payload.code) throw new ApiError(400, "Coupon code is required");
  const exists = await M().findOne({ where: { code: payload.code }, paranoid: true });
  if (exists) throw new ApiError(409, "Coupon code already exists");
  return M().create(payload);
};

const validateCoupon = async ({ code, subtotal }) => {
  const normalizedCode = normalizeCode(code);
  const orderSubtotal = parseAmount(subtotal);
  if (!normalizedCode) throw new ApiError(400, "Coupon code is required");
  if (orderSubtotal <= 0) throw new ApiError(400, "Order subtotal is required");

  const coupon = await M().findOne({
    where: { code: normalizedCode },
    paranoid: true,
  });
  if (!coupon) throw new ApiError(404, "Coupon not found");
  if (String(coupon.status).toLowerCase() !== "active") {
    throw new ApiError(400, "Coupon is inactive");
  }

  if (coupon.date) {
    const expiry = new Date(coupon.date);
    if (!Number.isNaN(expiry.getTime())) {
      expiry.setHours(23, 59, 59, 999);
      if (expiry < new Date()) throw new ApiError(400, "Coupon has expired");
    }
  }

  const minimumBuyAmount = parseAmount(coupon.buyAmount);
  if (minimumBuyAmount > 0 && orderSubtotal < minimumBuyAmount) {
    throw new ApiError(400, `Minimum order amount is ${minimumBuyAmount}`);
  }

  const amount = parseAmount(coupon.amount);
  const isPercentage = String(coupon.type || "").toLowerCase().startsWith("percent");
  const calculatedDiscount = isPercentage ? (orderSubtotal * amount) / 100 : amount;
  const discount = Math.max(0, Math.min(orderSubtotal, Math.round(calculatedDiscount)));

  return {
    Id: coupon.Id,
    code: coupon.code,
    type: coupon.type,
    amount,
    buyAmount: minimumBuyAmount,
    discount,
    subtotal: orderSubtotal,
    totalAfterDiscount: Math.max(0, orderSubtotal - discount),
  };
};

// Coupons shown on the storefront: active and not past their expiry date.
const getPublicFromDB = async () => {
  const rows = await M().findAll({
    where: { status: "Active" },
    attributes: ["Id", "code", "date", "type", "amount", "buyAmount", "image"],
    order: [["createdAt", "DESC"]],
    paranoid: true,
  });
  const today = new Date().toISOString().slice(0, 10);
  return rows
    .map((row) => row.get({ plain: true }))
    .filter((coupon) => !coupon.date || String(coupon.date).slice(0, 10) >= today)
    .map((coupon) => ({
      ...coupon,
      type: normalizeType(coupon.type),
      amount: parseAmount(coupon.amount),
      buyAmount: parseAmount(coupon.buyAmount),
    }));
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters || {};
  const where = searchTerm ? { code: { [Op.like]: `%${normalizeCode(searchTerm)}%` } } : {};
  const [data, count] = await Promise.all([
    M().findAll({ where, offset: skip, limit, paranoid: true, order: [["createdAt", "DESC"]] }),
    M().count({ where }),
  ]);
  return { meta: { count, page, limit }, data };
};

const updateOneFromDB = async (id, payload) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Coupon not found");
  const data = normalizePayload({ ...row.get({ plain: true }), ...payload });
  const duplicate = await M().findOne({
    where: { code: data.code, Id: { [Op.ne]: id } },
    paranoid: true,
  });
  if (duplicate) throw new ApiError(409, "Coupon code already exists");
  await row.update(data);
  return row;
};

const deleteIdFromDB = async (id) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Coupon not found");
  await row.destroy();
  return { deleted: true };
};

module.exports = { insertIntoDB, getAllFromDB, getPublicFromDB, updateOneFromDB, deleteIdFromDB, validateCoupon };
