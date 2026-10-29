const axios = require("axios");
const { Op } = require("sequelize");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const OrderStatusService = require("../orderStatus/orderStatus.service");

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const COURIERS = ["Steadfast", "Pathao"];

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const normalizeIp = (value) =>
  String(value || "")
    .replace(/^::ffff:/, "")
    .split(",")[0]
    .trim();

const isPrivateIp = (ip) =>
  !ip ||
  ip === "::1" ||
  ip === "127.0.0.1" ||
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);

const statusKey = (value) => OrderStatusService.toOrderStatusKey(value);

const emptyCourierStats = () =>
  COURIERS.map((courier) => ({
    courier,
    totalParcel: 0,
    delivered: 0,
    return: 0,
    success: 0,
  }));

const parseJsonValue = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeCourierStats = (value) => {
  const rows = Array.isArray(parseJsonValue(value, [])) ? parseJsonValue(value, []) : [];
  const current = Object.fromEntries(
    emptyCourierStats().map((row) => [row.courier.toLowerCase(), { ...row }]),
  );

  rows.forEach((row) => {
    const key = String(row?.courier || "").trim().toLowerCase();
    if (!current[key]) return;
    current[key] = {
      ...current[key],
      totalParcel: Number(row.totalParcel || 0),
      delivered: Number(row.delivered || 0),
      return: Number(row.return || 0),
      success: Number(row.success || 0),
    };
  });

  return Object.values(current);
};

const buildCourierStats = (orders) => {
  const stats = Object.fromEntries(
    emptyCourierStats().map((row) => [row.courier.toLowerCase(), { ...row }]),
  );

  orders.forEach((order) => {
    const courierName = String(order.courier || "").trim();
    const key = courierName.toLowerCase();
    if (!stats[key]) return;
    const row = stats[key];
    row.totalParcel += 1;
    const keyStatus = statusKey(order.status);
    if (keyStatus === "delivered") row.delivered += 1;
    if (["returned", "return_received", "cancelled", "incomplete"].includes(keyStatus)) {
      row.return += 1;
    }
  });

  return Object.values(stats).map((row) => ({
    ...row,
    success: row.totalParcel
      ? Math.round((row.delivered / row.totalParcel) * 100)
      : 0,
  }));
};

const summarizeStats = (courierStats) => {
  const totalParcel = courierStats.reduce((sum, row) => sum + row.totalParcel, 0);
  const delivered = courierStats.reduce((sum, row) => sum + row.delivered, 0);
  const returned = courierStats.reduce((sum, row) => sum + row.return, 0);
  const successRate = totalParcel ? Math.round((delivered / totalParcel) * 100) : 0;
  return {
    totalParcel,
    delivered,
    return: returned,
    successRate,
  };
};

const riskFromSummary = ({ totalParcel, successRate }) => {
  if (!totalParcel) return { riskLevel: "unknown", score: 1 };
  if (successRate >= 80) return { riskLevel: "low", score: 1 };
  if (successRate >= 50) return { riskLevel: "medium", score: 3 };
  return { riskLevel: "high", score: 5 };
};

const lookupIpInfo = async (ipAddress) => {
  const ip = normalizeIp(ipAddress);
  if (isPrivateIp(ip)) {
    return {
      ip,
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      source: "local",
      note: "Private/local IP address",
    };
  }

  try {
    const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      params: { fields: "status,message,country,regionName,city,lat,lon,query" },
      timeout: 4000,
    });
    if (data?.status !== "success") throw new Error(data?.message || "IP lookup failed");
    return {
      ip: data.query || ip,
      country: data.country || null,
      region: data.regionName || null,
      city: data.city || null,
      latitude: data.lat ?? null,
      longitude: data.lon ?? null,
      source: "ip-api",
      note: "Approximate ISP/Tower location",
    };
  } catch (error) {
    return {
      ip,
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      source: "lookup_failed",
      note: error.message || "IP lookup failed",
    };
  }
};

const findPhoneOrders = async (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const variants = [...new Set([phone, normalized, normalized.slice(-11)].filter(Boolean))];
  return db.order.findAll({
    where: {
      [Op.or]: variants.map((value) => ({
        customerPhone: { [Op.like]: `%${value}%` },
      })),
    },
    paranoid: true,
    order: [["Id", "DESC"]],
  });
};

const generateFraudCheck = async (order) => {
  const phoneOrders = await findPhoneOrders(order.customerPhone);
  const courierStats = buildCourierStats(phoneOrders);
  const totals = summarizeStats(courierStats);
  const risk = riskFromSummary(totals);
  const ipInfo = await lookupIpInfo(order.ipAddress);
  const checkedAt = new Date();

  const payload = {
    orderId: order.Id,
    customerPhone: order.customerPhone,
    ipAddress: order.ipAddress,
    courierStats,
    ipInfo,
    successRate: totals.successRate,
    riskLevel: risk.riskLevel,
    score: risk.score,
    checkedAt,
  };

  await order.update({ fraudScore: risk.score }).catch(() => {});

  const existing = await db.orderFraudCheck.findOne({ where: { orderId: order.Id } });
  if (existing) {
    await existing.update(payload);
    return existing.reload();
  }
  return db.orderFraudCheck.create(payload);
};

const toResponse = (record) => {
  const courierStats = normalizeCourierStats(record.courierStats);
  return {
    id: record.Id,
    orderId: record.orderId,
    customerPhone: record.customerPhone,
    ipAddress: record.ipAddress,
    courierStats,
    totals: summarizeStats(courierStats),
    ipInfo: parseJsonValue(record.ipInfo, {}),
    successRate: record.successRate,
    riskLevel: record.riskLevel,
    score: record.score,
    checkedAt: record.checkedAt,
  };
};

const getFraudCheckFromDB = async (orderId, options = {}) => {
  const order = await db.order.findByPk(orderId);
  if (!order) throw new ApiError(404, "Order not found");

  const existing = await db.orderFraudCheck.findOne({ where: { orderId: order.Id } });
  const isFresh =
    existing &&
    !options.refresh &&
    Date.now() - new Date(existing.checkedAt || existing.updatedAt).getTime() < CACHE_TTL_MS;

  const record = isFresh ? existing : await generateFraudCheck(order);
  return toResponse(record);
};

// Same courier stats for a phone number before its order exists (Create Order).
const getPhoneFraudCheck = async (phone) => {
  const courierStats = buildCourierStats(await findPhoneOrders(phone));
  return { courierStats, totals: summarizeStats(courierStats) };
};

module.exports = {
  getFraudCheckFromDB,
  getPhoneFraudCheck,
};
