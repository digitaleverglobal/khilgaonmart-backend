const crypto = require("crypto");
const { Op, fn, col, literal } = require("sequelize");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const paginationHelpers = require("../../../helpers/paginationHelper");
const { ORDER_STATUS, ORDER_STATUS_VALUES, ORDER_SEARCHABLE_FIELDS, RETURN_STATUSES } = require("./order.constants");
const SiteSettingService = require("../siteSetting/siteSetting.service");
const OrderStatusService = require("../orderStatus/orderStatus.service");
const CouponCodeService = require("../couponCode/couponCode.service");
const NotificationService = require("../notification/notification.service");
const SmsMarketingService = require("../smsMarketing/smsMarketing.service");
const { priceOrderItems, resolveStaffItems, calculateStaffTotals } = require("./orderPricing");
const { registerOrderStockHooks } = require("./orderStock");
const { registerErpSyncHooks, queueOrderPush } = require("./erpSync");
const { registerCustomerSyncHooks, normalizeCustomerPhone } = require("../customer/customerSync");
const RewardService = require("../reward/reward.service");
const { appendStatusHistory, registerOrderStatusHistoryHook } = require("./orderStatusHistory");
const { buildOrderListFilterConditions, hasProductFilter, metaText } = require("./orderFilters");
const { ORDER_REPORT_TYPES, buildOrderReport, buildSalesSummary, buildPackingList } = require("./orderReports");

const Order = db.order;
const { MIN_OPEN_SEARCH_LENGTH, scopeOrdersToUser } = require("./orderAccess");
registerOrderStockHooks(Order);
registerOrderStatusHistoryHook(Order);
registerErpSyncHooks(Order);
registerCustomerSyncHooks(db, Order);
RewardService.registerRewardHooks(Order);
const IpBlock = db.ipBlock;
const User = db.user;
const FAILED_DELIVERY_STATUSES = ["cancelled", ...RETURN_STATUSES, "on_hold"];
const MANUAL_FRAUD_STATUSES = ["safe", "fake"];
const ORDER_ASSIGNMENT_USER_ATTRIBUTES = [
  "Id",
  "FirstName",
  "LastName",
  "Email",
  "Phone",
  "role",
  "status",
];

const LOOPBACK_IP_VARIANTS = [
  "127.0.0.1",
  "::1",
  "0:0:0:0:0:0:0:1",
  "localhost",
];

const normalizeIpAddress = (value) =>
  String(value || "")
    .trim()
    .replace(/^::ffff:/, "");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const getUserDisplayName = (user = {}) =>
  [user.FirstName, user.LastName].filter(Boolean).join(" ").trim() ||
  user.Name ||
  user.Email ||
  user.Phone ||
  `User ${user.Id}`;

const ORDER_ASSIGNMENT_INCLUDES = [
  {
    model: User,
    as: "assignedEmployee",
    attributes: ORDER_ASSIGNMENT_USER_ATTRIBUTES,
    required: false,
  },
  {
    model: User,
    as: "assignedByUser",
    attributes: ORDER_ASSIGNMENT_USER_ATTRIBUTES,
    required: false,
  },
];

const withAssignmentUsers = (order = {}) => {
  const assignedEmployee = order.assignedEmployee || null;
  const assignedByUser = order.assignedByUser || null;
  return {
    ...order,
    assignedEmployee,
    assignedByUser,
    assignedEmployeeName: assignedEmployee
      ? getUserDisplayName(assignedEmployee)
      : order.assignedEmployeeName,
    assignedByName: assignedByUser
      ? getUserDisplayName(assignedByUser)
      : order.assignedByName,
  };
};

const applyOrderAssignmentScope = scopeOrdersToUser;

const normalizeDeviceId = (value) =>
  String(value || "")
    .trim()
    .slice(0, 128);

const getIpVariants = (value) => {
  const ip = normalizeIpAddress(value);
  if (!ip) return [];
  if (LOOPBACK_IP_VARIANTS.includes(ip)) return LOOPBACK_IP_VARIANTS;
  return [...new Set([ip, String(value || "").trim()].filter(Boolean))];
};

// Invoice IDs look like "<prefix>-<number>", e.g. HD-0007. The prefix and the
// number's zero-padding are set in admin › Website › General Setting; the
// number is always the order's row Id.
const DEFAULT_ORDER_ID_PREFIX = "HD";
const DEFAULT_ORDER_ID_DIGITS = 4;
// Orders keep the prefix they were created with, so an invoice typed with any
// prefix this shop has used still matches (older orders were TJ-/WZ-).
const LEGACY_ORDER_ID_PREFIXES = [DEFAULT_ORDER_ID_PREFIX, "TJ", "WZ"];
const INVOICE_FORMAT_TTL_MS = 60 * 1000;

const normalizeOrderIdPrefix = (value) => {
  const prefix = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return /^[A-Z]/.test(prefix) ? prefix : DEFAULT_ORDER_ID_PREFIX;
};

const normalizeOrderIdDigits = (value) => {
  const digits = Number(value);
  return Number.isInteger(digits) && digits >= 1 && digits <= 10 ? digits : DEFAULT_ORDER_ID_DIGITS;
};

let invoiceFormat = { prefix: DEFAULT_ORDER_ID_PREFIX, digits: DEFAULT_ORDER_ID_DIGITS, loadedAt: 0 };

const getInvoiceFormat = async () => {
  if (Date.now() - invoiceFormat.loadedAt < INVOICE_FORMAT_TTL_MS) return invoiceFormat;
  try {
    const general = await SiteSettingService.getByType("general");
    invoiceFormat = {
      prefix: normalizeOrderIdPrefix(general?.data?.invoicePrefix),
      digits: normalizeOrderIdDigits(general?.data?.invoiceDigits),
      loadedAt: Date.now(),
    };
  } catch {
    // Keep the last known format if settings can't be read.
  }
  return invoiceFormat;
};

getInvoiceFormat();

const generateOrderId = async (transaction) => {
  const [{ prefix, digits }, last] = await Promise.all([
    getInvoiceFormat(),
    Order.findOne({
      order: [["Id", "DESC"]],
      paranoid: false,
      transaction,
    }),
  ]);
  const nextNum = last ? last.Id + 1 : 1;
  return `${prefix}-${String(nextNum).padStart(digits, "0")}`;
};

// Old TJ-/WZ- orders are shown with the HD prefix; others keep their own.
const displayInvoiceId = (orderId) => {
  const match = String(orderId || "").match(/^(TJ|WZ)-(\d+)$/i);
  return match ? `${DEFAULT_ORDER_ID_PREFIX}-${match[2]}` : orderId;
};

const orderIdVariants = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^([A-Za-z][A-Za-z0-9]{0,9}?)-?(\d+)$/);
  const prefixes = [...new Set([invoiceFormat.prefix, ...LEGACY_ORDER_ID_PREFIXES])];
  if (!match || !prefixes.includes(match[1].toUpperCase())) return [raw];
  // The padding may have changed over time, so try each width in use.
  const number = String(Number(match[2]));
  const numbers = [...new Set([
    number,
    number.padStart(DEFAULT_ORDER_ID_DIGITS, "0"),
    number.padStart(invoiceFormat.digits, "0"),
  ])];
  return prefixes.flatMap((prefix) => numbers.map((num) => `${prefix}-${num}`));
};

const parseOrderMeta = (note) => {
  if (!note || typeof note !== "string") return {};
  try {
    const parsed = JSON.parse(note);
    return parsed && parsed.__frontendOrder ? parsed : {};
  } catch {
    return {};
  }
};

const parseAnyOrderMeta = (note) => {
  if (!note || typeof note !== "string") return {};
  try {
    const parsed = JSON.parse(note);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

// Like parseAnyOrderMeta, but an old plain-text note is kept as legacyNote instead of dropped.
const parseMetaKeepingLegacyNote = (note) => {
  const meta = parseAnyOrderMeta(note);
  if (Object.keys(meta).length || typeof note !== "string" || !note.trim()) return meta;
  try {
    JSON.parse(note);
    return meta;
  } catch {
    return { legacyNote: note };
  }
};

const maskPhone = (phone) => {
  const digits = normalizePhone(phone);
  if (digits.length < 7) return phone || "";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const hashOrderOtp = (orderId, phone, otp) =>
  crypto
    .createHash("sha256")
    .update(`${orderId}:${normalizePhone(phone)}:${otp}:${process.env.JWT_SECRET || process.env.JWT_REFRESH_SECRET || "kafela-order-otp"}`)
    .digest("hex");

const toPublicOrder = (order) => {
  const plain = typeof order.toJSON === "function" ? order.toJSON() : order;
  const meta = parseOrderMeta(plain.note);
  const items = Array.isArray(meta.items)
    ? meta.items
    : [{
        name: plain.productName,
        image: plain.productImage || undefined,
        qty: plain.quantity || 1,
        price: Number(plain.totalBill || 0),
      }];

  return {
    ...withAssignmentUsers(plain),
    invoiceId: displayInvoiceId(plain.orderId),
    customerAddress: meta.customerAddress || [plain.customerArea, plain.customerDistrict].filter(Boolean).join(", "),
    paymentMethod: meta.paymentMethod || "cod",
    paymentStatus: meta.paymentStatus || "pending",
    orderTag: meta.orderTag || "",
    deliveryDate: meta.deliveryDate || null,
    customerNote: meta.customerNote || "",
    items,
    subtotal: meta.subtotal ?? Number(plain.totalBill || 0),
    deliveryCharge: meta.deliveryCharge ?? 0,
    total: meta.total ?? Number(plain.totalBill || 0),
  };
};

const normalizeFraudStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["fake", "fake_order"].includes(normalized)) return "fake";
  if (["safe", "clear"].includes(normalized)) return "safe";
  if (["high_risk", "high-risk", "risk"].includes(normalized)) return "high_risk";
  return "";
};

const unitToMs = (unit) => {
  const normalized = String(unit || "hour").trim().toLowerCase();
  if (normalized.startsWith("min")) return 60 * 1000;
  if (normalized.startsWith("day")) return 24 * 60 * 60 * 1000;
  if (normalized.startsWith("month")) return 30 * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
};

const formatDuration = (blockTime, timeUnit) =>
  `${blockTime} ${timeUnit || "Hour"}`;

const normalizeRuleKey = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["same_ip", "sameip", "ip"].includes(normalized)) return "same_ip";
  if (["same_device", "samedevice", "device"].includes(normalized)) return "same_device";
  if (["invalid_phone", "invalidphone", "phone"].includes(normalized)) return "invalid_phone";
  if (["suspicious_address", "fake_address", "address", "unknown_address"].includes(normalized)) {
    return "suspicious_address";
  }
  return "";
};

const normalizeDurationUnit = (value) => {
  const normalized = String(value || "hour").trim().toLowerCase();
  if (normalized.startsWith("day")) return "Day";
  if (normalized.startsWith("month")) return "Month";
  if (normalized.startsWith("unknown") || normalized.startsWith("permanent")) return "Unknown";
  return "Hour";
};

const getRuleDurationMs = (rule = {}) => {
  const unit = normalizeDurationUnit(rule.durationUnit || rule.timeUnit);
  if (unit === "Unknown") return null;
  const value = Number(rule.durationValue || rule.blockTime || rule.time || 1);
  return Math.max(1, value || 1) * unitToMs(unit);
};

const getRuleDurationLabel = (rule = {}) => {
  const unit = normalizeDurationUnit(rule.durationUnit || rule.timeUnit);
  if (unit === "Unknown") return "Unknown time";
  const value = Number(rule.durationValue || rule.blockTime || rule.time || 1);
  return `${Math.max(1, value || 1)} ${unit}`;
};

const isInvalidPhoneNumber = (value) => {
  const digits = normalizePhone(value);
  return !/^01\d{9}$/.test(digits);
};

const normalizeOrderBlockRules = (data = {}) => {
  const rawRules = Array.isArray(data.rules)
    ? data.rules
    : Object.entries(data.rules || {}).map(([key, rule]) => ({ key, ...rule }));

  return rawRules
    .map((rule) => ({
      key: normalizeRuleKey(rule.key || rule.type || rule.category),
      enabled: rule.enabled !== false && rule.status !== false,
      durationValue: Number(rule.durationValue || rule.blockTime || rule.time || 1),
      durationUnit: normalizeDurationUnit(rule.durationUnit || rule.timeUnit),
    }))
    .filter((rule) => rule.key && rule.enabled);
};

const getOrderBlockRuleSettings = async () => {
  const row = await SiteSettingService.getByType("order_block").catch(() => null);
  const data = row?.data || {};
  if (data.status === false) return [];
  return normalizeOrderBlockRules(data);
};

const getOrderBlockSettings = async () => {
  const settings = await SiteSettingService.getPublic();
  if (settings.status === false) return null;

  const limit = Number(settings.orderBlockLimit || 0);
  const blockTime = Number(settings.blockTime || 0);
  if (!limit || !blockTime) return null;

  const timeUnit = settings.timeUnit || "Hour";
  return {
    limit,
    blockTime,
    timeUnit,
    blockDurationMs: blockTime * unitToMs(timeUnit),
  };
};

const getOrderAddress = (payload = {}) => {
  const direct = payload.customerAddress || payload.address;
  if (direct) return String(direct).trim();

  const note = String(payload.note || "");
  const addressLine = note
    .split(/\r?\n/)
    .find((line) => /^address\s*:/i.test(line.trim()));
  if (addressLine) return addressLine.replace(/^address\s*:/i, "").trim();

  return String(payload.customerArea || "").trim();
};

const isSuspiciousAddress = (value) => {
  const address = String(value || "").trim();
  if (!address) return false;

  const normalized = address.toLowerCase();
  if (
    /\b(unknown|fake|test|asdf|qwer|n\/a|na|null|none)\b/i.test(address) ||
    /(হিজিবিজি|অজানা|ভুয়া|ভুয়া|ঠিকানা নাই)/i.test(address)
  ) {
    return true;
  }

  const lettersAndDigits = address.replace(/[^\p{L}\p{N}]/gu, "");
  if (lettersAndDigits.length < 5) return true;

  const uniqueChars = new Set(lettersAndDigits.toLowerCase()).size;
  if (lettersAndDigits.length >= 8 && uniqueChars <= 3) return true;
  if (/(.)\1{5,}/u.test(lettersAndDigits)) return true;
  if (/^(.)\1+$/u.test(lettersAndDigits)) return true;
  if (/^[a-z]{8,}$/i.test(normalized) && !/[aeiou]/i.test(normalized)) return true;

  return false;
};

const getActiveBlockWhere = ({ ipAddress, deviceId }) => {
  const identityConditions = [];
  const ipVariants = getIpVariants(ipAddress);
  if (ipVariants.length) identityConditions.push({ ip: { [Op.in]: ipVariants } });
  if (deviceId) identityConditions.push({ deviceId });
  if (!identityConditions.length) return null;

  return {
    [Op.and]: [
      { [Op.or]: identityConditions },
      {
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } },
        ],
      },
    ],
  };
};

const createTimedIpBlock = async ({ ipAddress, deviceId, settings, rule, reason }) => {
  if (!IpBlock || (!ipAddress && !deviceId)) return null;

  const ip = normalizeIpAddress(ipAddress) || `device:${deviceId}`;
  const durationMs = settings?.blockDurationMs ?? getRuleDurationMs(rule);
  const expiresAt = durationMs === null ? null : new Date(Date.now() + durationMs);
  const where = getActiveBlockWhere({ ipAddress: ip, deviceId });
  const existing = where
    ? await IpBlock.findOne({ where, paranoid: true })
    : null;

  if (existing) {
    await existing.update({
      deviceId: existing.deviceId || deviceId || null,
      reason,
      expiresAt,
    });
    return existing;
  }

  return IpBlock.create({
    ip,
    deviceId: deviceId || null,
    reason,
    expiresAt,
  });
};

const throwTimedBlockError = (settings) => {
  throw new ApiError(
    429,
    `Order limit reached. Please try again after ${formatDuration(settings.blockTime, settings.timeUnit)}.`,
  );
};

const throwRuleBlockError = (rule) => {
  throw new ApiError(
    429,
    `Order blocked. Please try again after ${getRuleDurationLabel(rule)}.`,
  );
};

const hasPreviousOrderFor = async (where) => {
  const count = await Order.count({
    where: {
      ...where,
      status: { [Op.ne]: "incomplete" },
    },
    paranoid: true,
  });
  return count > 0;
};

const enforceSelectedOrderBlockRules = async (payload = {}) => {
  const rules = await getOrderBlockRuleSettings();
  if (!rules.length) return;

  const ipAddress = normalizeIpAddress(payload.ipAddress);
  const deviceId = normalizeDeviceId(payload.deviceId);
  const address = getOrderAddress(payload);
  const customerPhone = payload.customerPhone;

  for (const rule of rules) {
    if (rule.key === "invalid_phone" && isInvalidPhoneNumber(customerPhone)) {
      await createTimedIpBlock({
        ipAddress,
        deviceId,
        rule,
        reason: `Auto blocked: invalid phone number (${getRuleDurationLabel(rule)})`,
      });
      throwRuleBlockError(rule);
    }

    if (rule.key === "suspicious_address" && isSuspiciousAddress(address)) {
      await createTimedIpBlock({
        ipAddress,
        deviceId,
        rule,
        reason: `Auto blocked: suspicious delivery address (${getRuleDurationLabel(rule)})`,
      });
      throwRuleBlockError(rule);
    }

    if (rule.key === "same_ip" && getIpVariants(ipAddress).length) {
      const matched = await hasPreviousOrderFor({
        ipAddress: { [Op.in]: getIpVariants(ipAddress) },
      });
      if (matched) {
        await createTimedIpBlock({
          ipAddress,
          deviceId,
          rule,
          reason: `Auto blocked: same IP address (${getRuleDurationLabel(rule)})`,
        });
        throwRuleBlockError(rule);
      }
    }

    if (rule.key === "same_device" && deviceId) {
      const matched = await hasPreviousOrderFor({ deviceId });
      if (matched) {
        await createTimedIpBlock({
          ipAddress,
          deviceId,
          rule,
          reason: `Auto blocked: same device (${getRuleDurationLabel(rule)})`,
        });
        throwRuleBlockError(rule);
      }
    }
  }
};

const enforceOrderBlockLimit = async (payload = {}) => {
  await enforceSelectedOrderBlockRules(payload);

  const settings = await getOrderBlockSettings();
  if (!settings) return;

  const customerPhone = payload.customerPhone;
  const ipAddress = normalizeIpAddress(payload.ipAddress);
  const deviceId = normalizeDeviceId(payload.deviceId);
  const address = getOrderAddress(payload);

  if (isSuspiciousAddress(address) && (ipAddress || deviceId)) {
    await createTimedIpBlock({
      ipAddress,
      deviceId,
      settings,
      reason: `Auto blocked: suspicious delivery address (${formatDuration(settings.blockTime, settings.timeUnit)})`,
    });
    throwTimedBlockError(settings);
  }

  const since = new Date(Date.now() - settings.blockDurationMs);
  const orConditions = [];
  if (customerPhone) orConditions.push({ customerPhone: String(customerPhone).trim() });
  const ipVariants = getIpVariants(ipAddress);
  if (ipVariants.length) orConditions.push({ ipAddress: { [Op.in]: ipVariants } });
  if (deviceId) orConditions.push({ deviceId });
  if (!orConditions.length) return;

  const count = await Order.count({
    where: {
      createdAt: { [Op.gte]: since },
      status: { [Op.ne]: "incomplete" },
      [Op.or]: orConditions,
    },
    paranoid: true,
  });

  if (count >= settings.limit) {
    await createTimedIpBlock({
      ipAddress,
      deviceId,
      settings,
      reason: `Auto blocked: order limit reached (${settings.limit} orders / ${formatDuration(settings.blockTime, settings.timeUnit)})`,
    });
    throwTimedBlockError(settings);
  }
};

const calculateItemsSubtotal = (items = []) =>
  items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
    0,
  );

const parseJsonObject = (value) => {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getSteadfastConfig = async () => {
  const settings = await SiteSettingService.getByType("courier_api");
  const config = settings?.data?.steadfast || {};
  if (config.status === false) throw new ApiError(400, "Steadfast courier API is disabled");
  if (!String(config.apiKey || "").trim() || !String(config.secretKey || "").trim()) {
    throw new ApiError(400, "Steadfast API key and secret key are required");
  }

  const rawUrl = String(config.url || "https://portal.packzy.com/api/v1").trim();
  const baseUrl = rawUrl
    .replace(/\/create_order(?:\/bulk-order)?\/?$/i, "")
    .replace(/\/api\/v1\/?$/i, "/api/v1")
    .replace(/\/+$/, "");

  return {
    baseUrl,
    apiKey: String(config.apiKey).trim(),
    secretKey: String(config.secretKey).trim(),
  };
};

const getPathaoConfig = async () => {
  const settings = await SiteSettingService.getByType("courier_api");
  const config = settings?.data?.pathao || {};
  if (config.status === false) throw new ApiError(400, "Pathao courier API is disabled");

  const clientId = String(config.clientId || config.apiKey || "").trim();
  const clientSecret = String(config.clientSecret || config.secretKey || "").trim();
  const username = String(config.username || config.email || "").trim();
  const password = String(config.password || "").trim();
  const storeId = Number(config.storeId || config.store_id || 0);

  const missing = [];
  if (!clientId) missing.push("clientId");
  if (!clientSecret) missing.push("clientSecret");
  if (!username) missing.push("username");
  if (!password) missing.push("password");
  if (!storeId) missing.push("storeId");
  if (missing.length) throw new ApiError(400, `Pathao credential(s) required: ${missing.join(", ")}`);

  const rawUrl = String(config.url || "https://api-hermes.pathao.com").trim();
  const baseUrl = rawUrl
    .replace(/\/aladdin\/api\/v1\/orders\/?$/i, "")
    .replace(/\/aladdin\/api\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  return {
    baseUrl,
    clientId,
    clientSecret,
    username,
    password,
    storeId,
    deliveryType: Number(config.deliveryType || 48),
    itemType: Number(config.itemType || 2),
    itemWeight: Number(config.itemWeight || 0.5),
    recipientCity: Number(config.recipientCity || config.cityId || 0) || undefined,
    recipientZone: Number(config.recipientZone || config.zoneId || 0) || undefined,
    recipientArea: Number(config.recipientArea || config.areaId || 0) || undefined,
  };
};

const steadfastRequest = async (path, { method = "GET", body } = {}) => {
  const config = await getSteadfastConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Api-Key": config.apiKey,
        "Secret-Key": config.secretKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!response.ok || (data?.status && Number(data.status) >= 400)) {
      throw new ApiError(response.status || 400, data?.message || "Steadfast request failed");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
};

const pathaoToken = async (config) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${config.baseUrl}/aladdin/api/v1/issue-token`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        username: config.username,
        password: config.password,
        grant_type: "password",
      }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!response.ok || data?.type === "error") {
      throw new ApiError(response.status || 400, data?.message || "Pathao token request failed");
    }
    const token = data?.access_token || data?.data?.access_token || data?.token;
    if (!token) throw new ApiError(400, "Pathao access token missing from response");
    return token;
  } finally {
    clearTimeout(timer);
  }
};

const pathaoRequest = async (path, { method = "GET", body, config, token } = {}) => {
  const resolvedConfig = config || await getPathaoConfig();
  const accessToken = token || await pathaoToken(resolvedConfig);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${resolvedConfig.baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!response.ok || data?.type === "error") {
      throw new ApiError(response.status || 400, data?.message || "Pathao request failed");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
};

const pathaoRequestFirst = async (paths, options = {}) => {
  let lastError;
  for (const path of paths) {
    try {
      return await pathaoRequest(path, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const normalizeCourierPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("880")) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
};

const getOrderMeta = (order) => parseJsonObject(order?.note);

// Admin manual orders used to save the delivery-charge option (e.g. "ঢাকার বাইরে ১২০ টাকা")
// as customerArea — that is not a deliverable address, so never send it to a courier.
const DELIVERY_CHARGE_LABEL = /^[ঀ-৿a-z\s]*[০-৯0-9]+\s*(টাকা|tk|taka)$/i;
const toCourierAddressPart = (value) => {
  const text = String(value || "").trim();
  return DELIVERY_CHARGE_LABEL.test(text) ? "" : text;
};

const getOrderAddressForCourier = (order) => {
  const meta = getOrderMeta(order);
  return (
    toCourierAddressPart(meta.customerAddress) ||
    toCourierAddressPart(order.customerAddress) ||
    [order.customerArea, order.customerDistrict].map(toCourierAddressPart).filter(Boolean).join(", ")
  ).trim();
};

const getOrderAdminNoteText = (order) => {
  const meta = getOrderMeta(order);
  if (Array.isArray(meta.adminNotes) && meta.adminNotes.length) {
    return meta.adminNotes
      .map((item) => (typeof item === "string" ? item : item?.text))
      .filter(Boolean)
      .join("; ")
      .slice(0, 250);
  }
  if (order.note && !Object.keys(meta).length) return String(order.note).slice(0, 250);
  return "";
};

// The order page's Courier Note goes to the courier; otherwise the admin notes do.
const getCourierNoteText = (order) =>
  String(getOrderMeta(order).courierNote || "").trim() || getOrderAdminNoteText(order);

const getOrderDueAmount = (order) => {
  const meta = getOrderMeta(order);
  const total = Number(order.totalBill || meta.total || 0);
  const discount = Number(meta.discount || meta.less || 0);
  const paid = Number(order.advance || meta.advance || meta.paid || 0);
  return Math.max(0, total - discount - paid);
};

const buildSteadfastOrderPayload = (order, options = {}) => {
  const phone = normalizeCourierPhone(order.customerPhone);
  if (!/^01\d{9}$/.test(phone)) {
    throw new ApiError(400, "Valid 11 digit recipient phone is required for Steadfast");
  }

  const recipientAddress = getOrderAddressForCourier(order);
  if (!recipientAddress) throw new ApiError(400, "Recipient address is required for Steadfast");

  return {
    invoice: order.orderId,
    recipient_name: String(order.customerName || "Customer").slice(0, 100),
    recipient_phone: phone,
    alternative_phone: options.alternativePhone ? normalizeCourierPhone(options.alternativePhone) : undefined,
    recipient_email: options.recipientEmail || undefined,
    recipient_address: recipientAddress.slice(0, 250),
    cod_amount: Number(options.codAmount ?? getOrderDueAmount(order)),
    note: String(options.note || getCourierNoteText(order) || "").slice(0, 250) || undefined,
    item_description: String(order.productName || "").slice(0, 250) || undefined,
    total_lot: Number(options.totalLot || order.quantity || 1),
    delivery_type: Number(options.deliveryType ?? 0),
  };
};

const buildPathaoOrderPayload = (order, config, options = {}) => {
  const phone = normalizeCourierPhone(order.customerPhone);
  if (!/^01\d{9}$/.test(phone)) {
    throw new ApiError(400, "Valid 11 digit recipient phone is required for Pathao");
  }

  const recipientAddress = getOrderAddressForCourier(order);
  if (recipientAddress.length < 10) {
    throw new ApiError(400, "Recipient address must be at least 10 characters for Pathao");
  }
  // City/zone picked on the order page ("Pathao Location") wins over the store default.
  const pathaoLocation = getOrderMeta(order).pathaoLocation || {};

  return {
    store_id: Number(options.storeId || config.storeId),
    merchant_order_id: order.orderId,
    recipient_name: String(order.customerName || "Customer").slice(0, 100),
    recipient_phone: phone,
    recipient_secondary_phone: options.alternativePhone ? normalizeCourierPhone(options.alternativePhone) : undefined,
    recipient_address: recipientAddress.slice(0, 220),
    recipient_city: options.recipientCity || pathaoLocation.cityId || config.recipientCity,
    recipient_zone: options.recipientZone || pathaoLocation.zoneId || config.recipientZone,
    recipient_area: options.recipientArea || pathaoLocation.areaId || config.recipientArea,
    delivery_type: Number(options.deliveryType || config.deliveryType || 48),
    item_type: Number(options.itemType || config.itemType || 2),
    special_instruction: String(options.note || getCourierNoteText(order) || "").slice(0, 250) || undefined,
    item_quantity: Number(options.itemQuantity || order.quantity || 1),
    item_weight: Number(options.itemWeight || config.itemWeight || 0.5),
    item_description: String(order.productName || "Parcel").slice(0, 250),
    amount_to_collect: Number(options.codAmount ?? getOrderDueAmount(order)),
  };
};

const compactObject = (value) =>
  Object.entries(value).reduce((acc, [key, item]) => {
    if (item !== undefined && item !== null && item !== "") acc[key] = item;
    return acc;
  }, {});

const mapSteadfastStatusToOrderStatus = (status) => {
  const key = String(status || "").toLowerCase();
  if (key === "delivered") {
    return "delivered";
  }
  if (["cancelled", "cancelled_approval_pending"].includes(key)) return "cancelled";
  if (key === "partial_delivered") return "returned";
  if (key === "hold") return "on_hold";
  if ([
    "pending",
    "in_review",
    "delivered_approval_pending",
    "partial_delivered_approval_pending",
    "unknown",
    "unknown_approval_pending",
  ].includes(key)) return "in_courier";
  return null;
};

const mapPathaoStatusToOrderStatus = (status) => {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  if (["delivered", "order_delivered"].includes(key)) return "delivered";
  if ([
    "cancelled",
    "cancel",
    "rejected",
    "pickup_cancelled",
    "order_cancelled",
    "order_pickup_cancelled",
  ].includes(key)) return "cancelled";
  if ([
    "returned",
    "return",
    "return_to_merchant",
    "returned_to_merchant",
    "partial_delivery",
    "partial_delivered",
    "partial_return",
    "paid_return",
    "order_returned",
    "order_paid_return",
    "order_partial_delivery",
    "order_partial_delivered",
    "order_returned_to_merchant",
  ].includes(key)) return "returned";
  if ([
    "hold",
    "on_hold",
    "delivery_failed",
    "pickup_failed",
    "order_hold",
    "order_on_hold",
    "order_delivery_failed",
    "order_pickup_failed",
  ].includes(key)) return "on_hold";
  if (key) return "in_courier";
  return null;
};

const canSendToCourier = (order) =>
  OrderStatusService.toOrderStatusKey(order?.status) === "confirmed";

const mergeCourierMeta = (order, provider, data = {}) => {
  const meta = getOrderMeta(order);
  return JSON.stringify({
    ...(!Object.keys(meta).length && order.note ? { legacyNote: order.note } : {}),
    ...meta,
    courierIntegration: {
      ...(meta.courierIntegration || {}),
      [provider]: {
        ...(meta.courierIntegration?.[provider] || {}),
        ...data,
        updatedAt: new Date().toISOString(),
      },
    },
  });
};

const getSteadfastMeta = (order) => getOrderMeta(order).courierIntegration?.steadfast || {};
const getPathaoMeta = (order) => getOrderMeta(order).courierIntegration?.pathao || {};

const getOrderForCourier = async (id) => {
  const order = await Order.findByPk(id);
  if (!order) throw new ApiError(404, "Order not found");
  return order;
};

const checkoutKeyFromPayload = (payload) => {
  if (!payload.checkoutKey) return null;
  const key = String(payload.checkoutKey);
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
    throw new ApiError(400, "Invalid checkout key");
  }
  return key;
};

const withOrderWriteLock = (work) => db.sequelize.transaction(async (transaction) => {
  const lock = await db.orderWriteLock.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
  if (!lock) throw new ApiError(503, "Order storage is initializing. Please retry.");
  return work(transaction);
});

const getIncompleteOrderFromPayload = async (payload = {}, transaction) => {
  const checkoutKey = checkoutKeyFromPayload(payload);
  if (checkoutKey) {
    const existing = await Order.findOne({ where: { checkoutKey }, transaction, paranoid: false });
    if (existing?.deletedAt) throw new ApiError(409, "This checkout was deleted. Start a new checkout.");
    if (existing && String(existing.customerPhone).trim() !== String(payload.customerPhone).trim()) {
      throw new ApiError(409, "Checkout phone does not match");
    }
    if (existing) return existing;
    // A new checkout key represents a new purchase, even for the same phone.
    return null;
  }
  const phone = String(payload.customerPhone || "").trim();
  const incompleteOrderId = Number(payload.incompleteOrderId || payload.draftOrderId || 0);
  if (incompleteOrderId && phone) {
    const order = await Order.findOne({
      where: { Id: incompleteOrderId, customerPhone: phone }, transaction,
    });
    if (order) return order; // Completed drafts must never become incomplete again.
  }
  if (!phone) return null;
  return Order.findOne({
    where: { customerPhone: phone, status: "incomplete" },
    order: [["Id", "DESC"]], transaction,
  });
};

const applyOrderCoupon = async (payload = {}) => {
  if (!Array.isArray(payload.items)) return payload;

  const itemSubtotal = calculateItemsSubtotal(payload.items);
  const subtotal = itemSubtotal > 0 ? itemSubtotal : Number(payload.subtotal || 0);
  const deliveryCharge = Number(payload.deliveryCharge || 0);
  // Combo offers are priced as their products minus this saving (see orderPricing).
  const comboDiscount = Math.min(Math.max(0, Number(payload.comboDiscount || 0)), subtotal);
  let discount = comboDiscount;
  let couponCode = null;

  if (payload.couponCode) {
    const appliedCoupon = await CouponCodeService.validateCoupon({
      code: payload.couponCode,
      subtotal: subtotal - comboDiscount,
    });
    discount += Number(appliedCoupon.discount || 0);
    couponCode = appliedCoupon.code;
  }

  return {
    ...payload,
    subtotal,
    deliveryCharge,
    comboDiscount,
    discount,
    couponCode,
    total: Math.max(0, subtotal + deliveryCharge - discount),
  };
};

const buildItemsProductName = (items = []) =>
  items
    .map((item) => `${item.name}${item.variant ? ` (${item.variant})` : ""} x${item.qty || 1}`)
    .join(", ")
    .slice(0, 255);

const normalizeCreatePayload = ({ stockLedger, ...payload }) => {
  const orderSource = payload.orderSource || payload.source || "Website";
  if (!Array.isArray(payload.items)) {
    return {
      ...payload,
      orderSource: payload.orderSource || payload.source || "Manual",
      orderDate: payload.orderDate || new Date().toISOString().slice(0, 10),
    };
  }

  const items = payload.items;
  const quantity = items.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 1;
  const firstItem = items[0] || {};
  const productName = buildItemsProductName(items);
  const meta = {
    __frontendOrder: true,
    customerAddress: payload.customerAddress || "",
    ...(payload.deliveryArea ? { deliveryArea: payload.deliveryArea, deliveryAreaId: payload.deliveryAreaId } : {}),
    paymentMethod: payload.paymentMethod || "cod",
    paymentStatus: payload.paymentMethod && payload.paymentMethod !== "cod" ? "unverified" : "pending",
    items,
    subtotal: Number(payload.subtotal || 0),
    deliveryCharge: Number(payload.deliveryCharge || 0),
    discount: Number(payload.discount || 0),
    ...(Number(payload.comboDiscount) > 0 ? { comboDiscount: Number(payload.comboDiscount) } : {}),
    couponCode: payload.couponCode || null,
    ...(Number(payload.rewardPoints) > 0
      ? { rewardPoints: Number(payload.rewardPoints), rewardDiscount: Number(payload.rewardDiscount || 0) }
      : {}),
    advance: Number(payload.advance || 0),
    total: Number(payload.total || 0),
    tracking: payload.tracking || payload.trackingData || null,
    source: orderSource,
    orderSource,
    orderTag: typeof payload.orderTag === "string" ? payload.orderTag.trim() : "",
    deliveryDate: /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2} (AM|PM))?$/.test(String(payload.deliveryDate || "")) ? payload.deliveryDate : null,
    customerNote: String(payload.customerNote || "").trim().slice(0, 500),
  };

  return {
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    ipAddress: payload.ipAddress,
    deviceId: payload.deviceId,
    customerArea: payload.customerAddress || null,
    customerDistrict: payload.customerDistrict || null,
    productName: productName || "Website Order",
    productImage: firstItem.image || null,
    quantity,
    totalBill: Number(payload.total || payload.subtotal || 0),
    advance: Number(payload.advance || 0),
    orderSource,
    // Orders with a pre-order variant wait in their own queue ahead of Pending.
    status: items.some((item) => item.preOrder) ? "pre_order" : "pending",
    orderDate: new Date().toISOString().slice(0, 10),
    note: JSON.stringify(meta),
  };
};

const extractOrderSourceFromNote = (note) => {
  if (!note || typeof note !== "string") return "";
  try {
    const meta = JSON.parse(note);
    return String(meta.orderSource || meta.source || meta.platform || "").trim();
  } catch (error) {
    return "";
  }
};

const createOrderInDB = async (payload, options = {}) => {
  if (checkoutKeyFromPayload(payload)) {
    const replay = await getIncompleteOrderFromPayload(payload);
    if (replay && replay.status !== "incomplete") return toPublicOrder(replay);
  }
  const ipAddress = normalizeIpAddress(payload.ipAddress);
  const deviceId = normalizeDeviceId(payload.deviceId);
  if ((ipAddress || deviceId) && IpBlock) {
    const blockWhere = getActiveBlockWhere({ ipAddress, deviceId });
    const blockedIp = await IpBlock.findOne({
      where: blockWhere,
      paranoid: true,
    });
    if (blockedIp) {
      throw new ApiError(403, "Orders from this IP address are blocked");
    }
  }
  const customerPhone = normalizeCustomerPhone(payload.customerPhone);
  if (customerPhone) {
    const blockedCustomer = await db.customer.findOne({
      where: { phone: customerPhone, status: "Blocked" },
      attributes: ["Id"],
    });
    if (blockedCustomer) {
      throw new ApiError(403, "Orders from this phone number are blocked");
    }
  }
  const pricedPayload = await priceOrderItems(payload, { strict: true });
  const couponPayload = await applyOrderCoupon({ ...pricedPayload, ipAddress, deviceId });
  // Reward points: only for a logged-in customer ordering on their own phone.
  const checkedPayload = await RewardService.applyRewardRedemption(couponPayload, options.customerPhone);
  const rewardPoints = Number(checkedPayload.rewardPoints || 0);
  const normalizedPayload = normalizeCreatePayload(checkedPayload);
  // Run settings checks before taking the write lock: they use their own DB connection.
  // Replays are resolved first below, so an already saved checkout can still be retrieved.
  let blockError;
  try { await enforceOrderBlockLimit(checkedPayload); } catch (error) { blockError = error; }
  const { order, created } = await withOrderWriteLock(async (transaction) => {
    const existing = options.orderId ? await Order.findOne({
      where: { orderId: options.orderId }, transaction,
    }) : await getIncompleteOrderFromPayload(checkedPayload, transaction);
    if (existing && existing.status !== "incomplete") return { order: existing, created: false };
    if (blockError) throw blockError;
    if (existing) {
      const status = normalizedPayload.status === "pre_order" ? "pre_order" : "pending";
      await existing.update({ ...normalizedPayload, status }, { transaction });
      await RewardService.recordRedemption(existing, rewardPoints, transaction);
      return { order: existing, created: true };
    }
    const orderId = options.orderId || await generateOrderId(transaction);
    const order = await Order.create({
      ...normalizedPayload, orderId, checkoutKey: checkoutKeyFromPayload(checkedPayload),
    }, { transaction });
    await RewardService.recordRedemption(order, rewardPoints, transaction);
    return { order, created: true };
  });
  if (!created) return toPublicOrder(order);

  await autoDistributeOrder(order.Id)
    .then((employeeId) => employeeId && order.reload())
    .catch((error) => console.error("Order auto distribution failed:", error.message));

  await NotificationService.createForRoles(
    ["superAdmin", "admin", "cs"],
    {
      title: "New order received",
      message: `${order.orderId} — ${order.customerName || "Customer"} — ৳${Number(order.totalBill || 0).toFixed(2)}`,
      type: "order_created",
      priority: "high",
      url: "/#page=orders&orderStatus=pending",
      data: { orderId: order.Id, invoiceId: order.orderId },
    },
  ).catch((error) => console.error("Order notification failed:", error.message));
  return toPublicOrder(order);
};

// Orders placed by staff from the admin panel (POS). Staff prices are trusted, but every
// product line is resolved to a variant so stock is tracked.
const createStaffOrderInDB = async (payload = {}, actor = {}) => {
  const items = await resolveStaffItems(payload.items);
  const totals = calculateStaffTotals(items, payload);
  const orderSource = payload.orderSource || payload.source || "Manual";
  const normalizedPayload = {
    ...normalizeCreatePayload({
      ...payload,
      ...totals,
      items,
      advance: Math.max(0, Number(payload.advance) || 0),
      customerAddress: payload.customerAddress || payload.customerArea || "",
      paymentMethod: "cod",
      orderSource,
    }),
    orderDate: payload.orderDate || new Date().toISOString().slice(0, 10),
  };

  const { order, created } = await withOrderWriteLock(async (transaction) => {
    const checkoutKey = checkoutKeyFromPayload(payload);
    if (checkoutKey) {
      const existing = await Order.findOne({ where: { checkoutKey }, transaction });
      if (existing) return { order: existing, created: false };
    }
    const orderId = await generateOrderId(transaction);
    // An order created from the panel is assigned to whoever created it.
    const ownAssignment = actor?.Id
      ? {
        assignedEmployeeId: actor.Id,
        assignedEmployeeName: getUserDisplayName(actor),
        assignedById: actor.Id,
        assignedByName: getUserDisplayName(actor),
        assignedAt: new Date(),
      }
      : {};
    const order = await Order.create({ ...normalizedPayload, ...ownAssignment, orderId, checkoutKey }, { transaction });
    return { order, created: true };
  });

  if (created) {
    await NotificationService.createForRoles(
      ["superAdmin", "admin", "cs"],
      {
        title: "New order received",
        message: `${order.orderId} — ${order.customerName || "Customer"} — ৳${Number(order.totalBill || 0).toFixed(2)}`,
        type: "order_created",
        priority: "high",
        url: "/#page=orders&orderStatus=pending",
        data: { orderId: order.Id, invoiceId: order.orderId },
      },
    ).catch((error) => console.error("Order notification failed:", error.message));
  }
  return toPublicOrder(order);
};

const saveIncompleteOrderInDB = async (payload = {}) => {
  const phone = String(payload.customerPhone || "").trim();
  if (!phone) throw new ApiError(400, "Customer phone is required");

  if (checkoutKeyFromPayload(payload)) {
    const replay = await getIncompleteOrderFromPayload(payload);
    if (replay && replay.status !== "incomplete") return toPublicOrder(replay);
  }
  const ipAddress = normalizeIpAddress(payload.ipAddress);
  const deviceId = normalizeDeviceId(payload.deviceId);
  const pricedPayload = await priceOrderItems(payload, { strict: false });
  const checkedPayload = await applyOrderCoupon({ ...pricedPayload, ipAddress, deviceId });
  const normalizedPayload = {
    ...normalizeCreatePayload({
      ...checkedPayload,
      customerName: checkedPayload.customerName || "Incomplete Customer",
      customerAddress: checkedPayload.customerAddress || "",
      paymentMethod: checkedPayload.paymentMethod || "cod",
    }),
    status: "incomplete",
  };

  return withOrderWriteLock(async (transaction) => {
    const existing = await getIncompleteOrderFromPayload(checkedPayload, transaction);
    if (existing) {
      if (existing.status !== "incomplete") return toPublicOrder(existing);
      await existing.update(normalizedPayload, { transaction });
      return toPublicOrder(existing);
    }
    const orderId = await generateOrderId(transaction);
    const order = await Order.create({
      ...normalizedPayload, orderId, checkoutKey: checkoutKeyFromPayload(checkedPayload),
    }, { transaction });
    return toPublicOrder(order);
  });
};

const validateOrderStatus = async (status) => {
  const key = OrderStatusService.toOrderStatusKey(status);
  const activeKeys = await OrderStatusService.getActiveStatusKeys();
  // Return Received is built in, so it is valid even though it is not in the status settings.
  const validKeys = [...(activeKeys.length ? activeKeys : ORDER_STATUS_VALUES), ORDER_STATUS.RETURN_RECEIVED];
  if (!validKeys.includes(key)) {
    throw new ApiError(400, `Invalid status. Valid: ${validKeys.join(", ")}`);
  }
  return key;
};

const getFraudGuardForOrder = async (plainOrder = {}) => {
  const manualStatus = normalizeFraudStatus(plainOrder.fraudStatus);
  if (manualStatus === "fake") {
    return {
      status: "fake",
      label: "Fake Order",
      reason: plainOrder.fraudReason || "Manually marked as fake",
    };
  }
  if (manualStatus === "safe") {
    return {
      status: "safe",
      label: "Safe",
      reason: plainOrder.fraudReason || "Manually marked as safe",
    };
  }

  const phone = String(plainOrder.customerPhone || "").trim();
  if (!phone) {
    return { status: "safe", label: "Safe", reason: "No previous risk found" };
  }

  const rows = await Order.findAll({
    attributes: ["status", "fraudStatus", "fraudReason"],
    where: {
      customerPhone: phone,
    },
    raw: true,
    paranoid: true,
  });

  const manuallyFake = rows.find((row) => normalizeFraudStatus(row.fraudStatus) === "fake");
  if (manuallyFake) {
    return {
      status: "fake",
      label: "Fake Order",
      reason: manuallyFake.fraudReason || "Customer manually marked as fake",
    };
  }

  const manuallySafe = rows.find((row) => normalizeFraudStatus(row.fraudStatus) === "safe");
  if (manuallySafe) {
    return {
      status: "safe",
      label: "Safe",
      reason: manuallySafe.fraudReason || "Customer manually marked as safe",
    };
  }

  const deliveredCount = rows.filter((row) => OrderStatusService.toOrderStatusKey(row.status) === "delivered").length;
  const failedCount = rows.filter((row) => FAILED_DELIVERY_STATUSES.includes(OrderStatusService.toOrderStatusKey(row.status))).length;

  if (failedCount >= 3 && deliveredCount === 0) {
    return {
      status: "high_risk",
      label: "High Risk",
      reason: `${failedCount} previous non-delivered orders, no delivered order found`,
      failedCount,
      deliveredCount,
    };
  }

  return {
    status: "safe",
    label: "Safe",
    reason: "No previous risk found",
    failedCount,
    deliveredCount,
  };
};

const phoneHistoryKey = (phone) => normalizePhone(phone).slice(-10);
const FAILED_PARCEL_STATUSES = [...RETURN_STATUSES, "cancelled", "incomplete"];

// All orders of the given customers in one query, keyed by the last 10 phone digits.
const getCustomerOrderHistoryByPhone = async (phones = []) => {
  const keys = [...new Set(phones.map(phoneHistoryKey).filter((key) => key.length >= 6))];
  const byPhone = new Map();
  if (!keys.length) return byPhone;
  const phoneExpr = "RIGHT(REGEXP_REPLACE(`Order`.`customerPhone`, '[^0-9]', ''), 10)";
  const rows = await Order.findAll({
    attributes: ["Id", "customerPhone", "courier", "status"],
    where: db.sequelize.where(literal(phoneExpr), { [Op.in]: keys }),
    raw: true,
    paranoid: true,
  });
  rows.forEach((row) => {
    const key = phoneHistoryKey(row.customerPhone);
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(row);
  });
  return byPhone;
};

// Same counting as the fraud check: a parcel is an order handed to a courier.
const summarizeCustomerHistory = (history = []) => {
  const statusOf = (row) => OrderStatusService.toOrderStatusKey(row.status);
  const parcels = history.filter((row) => String(row.courier || "").trim());
  const delivered = parcels.filter((row) => statusOf(row) === "delivered").length;
  const failed = parcels.filter((row) => FAILED_PARCEL_STATUSES.includes(statusOf(row))).length;
  return {
    parcels: parcels.length,
    delivered,
    failed,
    successRate: parcels.length ? Math.round((delivered / parcels.length) * 100) : null,
    orders: history.length,
    completed: history.filter((row) => statusOf(row) === "delivered").length,
  };
};

// Where clause for the admin order list; shared with the filter reports.
const buildOrderListWhere = (filters = {}, currentUser = {}) => {
  const { status, search, fromDate, toDate, assignedEmployeeId, employeeAction } = filters;

  const where = {};

  const statusKey = status && status !== "all" ? OrderStatusService.toOrderStatusKey(status) : "";
  if (statusKey === ORDER_STATUS.RETURNED) {
    // The Returned tab also lists orders marked Return Received.
    where.status = { [Op.in]: RETURN_STATUSES };
  } else if (statusKey) {
    where.status = statusKey;
  } else if (hasProductFilter(filters) && !isFilterOn(filters.includeReturns)) {
    where.status = { [Op.notIn]: RETURN_STATUSES };
  }

  // "Assigned By" filters on who assigned the order instead of who it is assigned to.
  const employeeField = employeeAction === "assigned_by" ? "assignedById" : "assignedEmployeeId";
  if (assignedEmployeeId === "unassigned" || assignedEmployeeId === "not_assigned") {
    where[employeeField] = { [Op.is]: null };
  } else if (assignedEmployeeId && assignedEmployeeId !== "all") {
    where[employeeField] = Number(assignedEmployeeId);
  }

  if (search) {
    const invoiceVariants = orderIdVariants(search);
    where[Op.or] = [
      ...ORDER_SEARCHABLE_FIELDS.map((field) => ({
        [field]: { [Op.like]: `%${search}%` },
      })),
      ...(invoiceVariants.length > 1 ? [{ orderId: { [Op.in]: invoiceVariants } }] : []),
    ];
  }

  if (fromDate && toDate) {
    where.orderDate = { [Op.between]: [fromDate, toDate] };
  } else if (fromDate) {
    where.orderDate = { [Op.gte]: fromDate };
  } else if (toDate) {
    where.orderDate = { [Op.lte]: toDate };
  }

  const advancedConditions = buildOrderListFilterConditions(filters);
  if (advancedConditions.length) where[Op.and] = advancedConditions;

  return applyOrderAssignmentScope(where, currentUser);
};

const getOrdersFromDB = async (filters, paginationOptions, currentUser = {}) => {
  await getInvoiceFormat(); // invoice search matches the current prefix
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);
  // A search (phone, name, invoice ID, IP) looks through every order, so staff can
  // find and pick up an order that is not assigned to them yet.
  const searching = String(filters?.search || "").trim().length >= MIN_OPEN_SEARCH_LENGTH;
  const scopedWhere = buildOrderListWhere(filters, searching ? {} : currentUser);

  const { count, rows } = await Order.findAndCountAll({
    where: scopedWhere,
    include: ORDER_ASSIGNMENT_INCLUDES,
    distinct: true,
    limit,
    offset: skip,
    order: [[sortBy || "Id", sortOrder || "DESC"]],
  });

  const plainRows = rows.map((row) => (typeof row.toJSON === "function" ? row.toJSON() : row));
  const historyByPhone = await getCustomerOrderHistoryByPhone(plainRows.map((row) => row.customerPhone));

  const rowsWithRepeatInfo = await Promise.all(
    plainRows.map(async (plain) => {
      const history = historyByPhone.get(phoneHistoryKey(plain.customerPhone)) || [];
      const previousOrderCount = history.filter((item) => item.Id < plain.Id).length;
      return {
        ...withAssignmentUsers(plain),
        isRepeat: previousOrderCount > 0,
        previousOrderCount,
        courierSummary: summarizeCustomerHistory(history),
        fraudGuard: await getFraudGuardForOrder(plain),
      };
    }),
  );

  return {
    meta: { page, limit, total: count },
    data: rowsWithRepeatInfo,
  };
};

const isFilterOn = (value) => value === true || value === "true" || value === "1";

const distinctValues = async (expression) => {
  const rows = await Order.findAll({
    attributes: [[literal(expression), "value"]],
    group: [literal(expression)],
    raw: true,
  });
  return rows
    .map((row) => String(row.value ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
};

// Option lists for the admin order filter panel, taken from the values orders actually have.
const getOrderFilterOptionsFromDB = async () => {
  const [districts, orderSources, orderTags, courierStatuses, paymentStatuses, roles] = await Promise.all([
    distinctValues("TRIM(`Order`.`customerDistrict`)"),
    distinctValues(`COALESCE(NULLIF(\`Order\`.\`orderSource\`, ''), ${metaText("$.orderSource")})`),
    distinctValues(`LOWER(${metaText("$.orderTag")})`),
    distinctValues(`LOWER(COALESCE(${metaText("$.courierIntegration.steadfast.status")}, ${metaText("$.courierIntegration.pathao.status")}))`),
    distinctValues(`LOWER(COALESCE(${metaText("$.paymentStatus")}, 'pending'))`),
    User.findAll({ attributes: ["role"], group: ["role"], raw: true }).then((rows) =>
      [...new Set(rows.map((row) => normalizeRole(row.role)).filter(Boolean))].sort(),
    ),
  ]);
  return { districts, orderSources, orderTags, courierStatuses, paymentStatuses, roles };
};

const markOrdersPrintedInDB = async (orderIds = []) => {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(Number).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, "Order ids are required");
  const orders = await Order.findAll({ where: { Id: { [Op.in]: ids } } });
  const printedAt = new Date().toISOString();
  await Promise.all(orders.map((order) => {
    const meta = getOrderMeta(order);
    return order.update({
      note: JSON.stringify({
        ...(!Object.keys(meta).length && order.note ? { legacyNote: order.note } : {}),
        ...meta,
        printedAt,
        printCount: Number(meta.printCount || 0) + 1,
      }),
    });
  }));
  return { updated: orders.length, printedAt };
};

const ORDER_REPORT_ROW_LIMIT = 50000;

const getOrderReportFromDB = async (type, filters, currentUser = {}) => {
  if (!ORDER_REPORT_TYPES.includes(type)) throw new ApiError(400, "Unknown order report");
  const rows = await Order.findAll({
    where: buildOrderListWhere(filters, currentUser),
    attributes: [
      "Id", "orderId", "customerName", "customerPhone", "customerArea", "customerDistrict",
      "productName", "quantity", "totalBill", "advance", "courier", "orderSource", "status",
      "note", "assignedEmployeeName", "createdAt", "updatedAt",
    ],
    order: [["Id", "DESC"]],
    limit: ORDER_REPORT_ROW_LIMIT,
    raw: true,
  });
  return buildOrderReport(type, rows);
};

const getSalesSummaryFromDB = async (filters, currentUser = {}) => {
  const rows = await Order.findAll({
    where: buildOrderListWhere(filters, currentUser),
    attributes: ["Id", "productName", "quantity", "totalBill", "advance", "status", "note"],
    limit: ORDER_REPORT_ROW_LIMIT,
    raw: true,
  });

  // Purchase cost comes from each variant's purchase price, or the product's first priced variant.
  const metas = rows.map((row) => parseAnyOrderMeta(row.note));
  const productIds = new Set();
  metas.forEach((meta) => (Array.isArray(meta.items) ? meta.items : []).forEach((item) => {
    const productId = Number(item.id ?? item.productId);
    if (productId) productIds.add(productId);
  }));
  const variations = productIds.size
    ? await db.variation.findAll({
        where: { productId: { [Op.in]: [...productIds] } },
        attributes: ["Id", "productId", "purchasePrice"],
        paranoid: false,
        raw: true,
      })
    : [];
  const variationCosts = new Map();
  const productCosts = new Map();
  variations.forEach((variation) => {
    const cost = Number(variation.purchasePrice);
    if (!(cost > 0)) return;
    variationCosts.set(Number(variation.Id), cost);
    if (!productCosts.has(Number(variation.productId))) productCosts.set(Number(variation.productId), cost);
  });

  const expenseWhere = { status: "Active" };
  if (filters.fromDate && filters.toDate) expenseWhere.date = { [Op.between]: [filters.fromDate, filters.toDate] };
  else if (filters.fromDate) expenseWhere.date = { [Op.gte]: filters.fromDate };
  else if (filters.toDate) expenseWhere.date = { [Op.lte]: filters.toDate };
  const expenses = await db.expense.findAll({
    where: expenseWhere,
    attributes: ["categoryName", "amount"],
    raw: true,
  });

  return buildSalesSummary(rows, {
    variationCosts,
    productCosts,
    expenses,
    includeReturns: isFilterOn(filters.salesIncludeReturns),
  });
};

const getPackingListFromDB = async (filters = {}, options = {}, currentUser = {}) => {
  const includeReturns = isFilterOn(options.includeReturns);
  const rows = await Order.findAll({
    // Returned orders are fetched here and dropped by the builder unless Include Returns is set.
    where: buildOrderListWhere({ ...filters, includeReturns: "1" }, currentUser),
    attributes: ["Id", "productName", "productImage", "quantity", "totalBill", "status", "note"],
    limit: ORDER_REPORT_ROW_LIMIT,
    raw: true,
  });

  const productIds = new Set();
  rows.forEach((row) => {
    const meta = parseAnyOrderMeta(row.note);
    [...(Array.isArray(meta.items) ? meta.items : []), ...(Array.isArray(meta.originalItems) ? meta.originalItems : [])]
      .forEach((item) => {
        const productId = Number(item.id ?? item.productId);
        if (productId) productIds.add(productId);
      });
  });
  const productRows = productIds.size
    ? await db.product.findAll({
        where: { Id: { [Op.in]: [...productIds] } },
        attributes: ["Id", "name", "images", "rackNo"],
        include: [{ model: db.variation, as: "variations", attributes: ["Id", "stock", "purchasePrice", "colorImage"], required: false }],
        paranoid: false,
      })
    : [];
  const products = new Map(productRows.map((product) => [Number(product.Id), product.get({ plain: true })]));

  // With a product/category filter, only those products are listed unless "Include Other Products".
  const filteredIds = String(filters.product || "").split(",").map(Number).filter(Boolean);
  const categoryIds = String(filters.category || "").split(",").map(Number).filter(Boolean);
  let matchProductIds = null;
  if ((filteredIds.length && !isFilterOn(filters.productExclude)) || (categoryIds.length && !isFilterOn(filters.categoryExclude))) {
    matchProductIds = new Set(isFilterOn(filters.productExclude) ? [] : filteredIds);
    if (categoryIds.length && !isFilterOn(filters.categoryExclude)) {
      const inCategory = await db.product.findAll({ where: { categoryId: { [Op.in]: categoryIds } }, attributes: ["Id"], raw: true });
      inCategory.forEach((product) => matchProductIds.add(Number(product.Id)));
    }
  }

  return buildPackingList(rows, {
    products,
    options: {
      groupBy: options.groupBy === "product" ? "product" : "variation",
      includeReturns,
      includeOtherProducts: isFilterOn(options.includeOtherProducts),
      matchProductIds,
      upsales: ["exclude", "only"].includes(options.upsales) ? options.upsales : "",
      createTimeOnly: isFilterOn(options.createTimeOnly),
    },
  });
};

const BULK_ORDER_ACTIONS = ["status", "order_tag", "customer_tag", "delete_notes", "courier_unlink"];
const BULK_ORDER_LIMIT = 500;

const toBulkOrderIds = (orderIds) => {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(Number).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, "Order ids are required");
  if (ids.length > BULK_ORDER_LIMIT) throw new ApiError(400, `At most ${BULK_ORDER_LIMIT} orders at a time`);
  return ids;
};

// Applies one action to many orders; each order is updated on its own so a failure is
// reported per order instead of stopping the batch.
const bulkOrderActionInDB = async ({ orderIds, action, value } = {}, actor = {}) => {
  if (!BULK_ORDER_ACTIONS.includes(action)) throw new ApiError(400, "Invalid bulk action");
  const ids = toBulkOrderIds(orderIds);
  const updated = [];
  const failed = [];

  if (action === "customer_tag") {
    // Customer tag is per customer: updateOrderInDB applies it to every order of the phone.
    const fraudStatus = value === "none" ? "" : value;
    for (const id of ids) {
      try {
        await updateOrderInDB(id, { fraudStatus });
        updated.push(id);
      } catch (error) {
        failed.push({ id, message: error.message });
      }
    }
    return { updated: updated.length, failed };
  }

  for (const id of ids) {
    try {
      if (action === "status") {
        await updateOrderStatusInDB(id, value, actor.Id);
      } else if (action === "order_tag") {
        await updateOrderInDB(id, { orderTag: value === "none" ? "" : String(value || "") });
      } else {
        const order = await Order.findByPk(id);
        if (!order) throw new ApiError(404, "Order not found");
        const meta = parseMetaKeepingLegacyNote(order.note);
        if (action === "delete_notes") {
          delete meta.adminNotes;
          delete meta.legacyNote;
          await order.update({ note: JSON.stringify(meta) });
        } else {
          // Only forgets the courier link here; the parcel itself is not cancelled at the courier.
          delete meta.courierIntegration;
          await order.update({ courier: null, note: JSON.stringify(meta) });
        }
      }
      updated.push(id);
    } catch (error) {
      failed.push({ id, message: error.message });
    }
  }
  return { updated: updated.length, failed };
};

const sendSmsToOrdersInDB = async ({ orderIds, smsText } = {}) => {
  const ids = toBulkOrderIds(orderIds);
  const orders = await Order.findAll({
    where: { Id: { [Op.in]: ids } },
    attributes: ["customerName", "customerPhone"],
    raw: true,
  });
  const seen = new Set();
  const recipients = orders
    .map((order) => ({ phone: String(order.customerPhone || "").trim(), name: order.customerName }))
    .filter((recipient) => {
      const key = normalizePhone(recipient.phone).slice(-10);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return SmsMarketingService.sendSmsToRecipients(recipients, smsText);
};

const getPathaoCitiesFromProvider = () => pathaoRequest("/aladdin/api/v1/city-list");

const getPathaoZonesFromProvider = (cityId) =>
  pathaoRequest(`/aladdin/api/v1/cities/${encodeURIComponent(cityId)}/zone-list`);

const getOrderStatusCountsFromDB = async (currentUser = {}) => {
  const activeStatuses = await OrderStatusService.getActiveStatusOptions();
  const scopedWhere = applyOrderAssignmentScope({}, currentUser);
  const counts = await Order.findAll({
    attributes: ["status", [fn("COUNT", col("Id")), "count"]],
    where: scopedWhere,
    group: ["status"],
    raw: true,
  });

  const total = await Order.count({ where: scopedWhere });

  const result = { all: total };
  activeStatuses.forEach((s) => (result[s.key] = 0));
  counts.forEach(({ status, count }) => {
    const key = OrderStatusService.toOrderStatusKey(status);
    result[key] = (result[key] || 0) + Number(count);
  });
  // Return Received orders are listed in the Returned tab, so count them there too.
  result[ORDER_STATUS.RETURNED] = (result[ORDER_STATUS.RETURNED] || 0) + (result[ORDER_STATUS.RETURN_RECEIVED] || 0);

  return result;
};

const getOrderByIdFromDB = async (id, currentUser = {}) => {
  const order = await Order.findByPk(id, {
    include: ORDER_ASSIGNMENT_INCLUDES,
  });
  if (!order) throw new ApiError(404, "Order not found");
  const plain = typeof order.toJSON === "function" ? order.toJSON() : order;
  const history = (await getCustomerOrderHistoryByPhone([plain.customerPhone])).get(phoneHistoryKey(plain.customerPhone)) || [];
  return {
    ...withAssignmentUsers(plain),
    isRepeat: history.some((item) => item.Id < plain.Id),
    courierSummary: summarizeCustomerHistory(history),
    fraudGuard: await getFraudGuardForOrder(plain),
  };
};

const trackOrdersByPhoneFromDB = async (phone, invoiceId, options = {}) => {
  await getInvoiceFormat();
  const normalized = String(phone || "").trim();
  const normalizedInvoice = String(invoiceId || "").trim();
  if (!normalized && !normalizedInvoice) throw new ApiError(400, "Phone number or invoice ID is required");

  const activeTrackingStatuses = ["pre_order", "pending", "confirmed", "packaging", "in_courier", "on_hold"];
  const baseWhere = normalizedInvoice
    ? { orderId: { [Op.in]: orderIdVariants(normalizedInvoice) } }
    : { customerPhone: { [Op.like]: `%${normalized}%` } };
  const where = normalizedInvoice || options.includeHistory
    ? baseWhere
    : { ...baseWhere, status: { [Op.in]: activeTrackingStatuses } };

  let orders = await Order.findAll({
    where,
    limit: normalizedInvoice ? 1 : options.includeHistory ? 20 : 3,
    order: [["Id", "DESC"]],
    paranoid: true,
  });

  if (!normalizedInvoice && !options.includeHistory && orders.length === 0) {
    orders = await Order.findAll({
      where: baseWhere,
      limit: 1,
      order: [["Id", "DESC"]],
      paranoid: true,
    });
  }
  return orders.map(toPublicOrder);
};

const getCustomerOrderHistoryFromDB = async (phone, { page = 1, limit = 5 } = {}) => {
  const normalized = normalizePhone(phone);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 50);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  if (!normalized) return { orders: [], meta: { page: safePage, limit: safeLimit, total: 0 } };

  const { rows, count } = await Order.findAndCountAll({
    where: {
      customerPhone: { [Op.like]: `%${normalized}%` },
      status: { [Op.ne]: "incomplete" },
    },
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    order: [["Id", "DESC"]],
    paranoid: true,
  });

  return {
    orders: rows.map(toPublicOrder),
    meta: { page: safePage, limit: safeLimit, total: count },
  };
};

const getReconfirmOrder = async (id, phone) => {
  await getInvoiceFormat();
  const rawId = String(id || "").trim();
  const normalizedPhone = normalizePhone(phone);
  if (!rawId) throw new ApiError(400, "Order ID is required");
  if (!/^01\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, "Valid customer phone is required");
  }

  const order = await Order.findOne({
    where: {
      [Op.or]: [
        ...(Number(rawId) ? [{ Id: Number(rawId) }] : []),
        { orderId: { [Op.in]: orderIdVariants(rawId) } },
      ],
      customerPhone: { [Op.like]: `%${normalizedPhone}%` },
    },
    paranoid: true,
  });
  if (!order) throw new ApiError(404, "Order not found");
  return order;
};

const sendOrderReconfirmOtpInDB = async (id, payload = {}) => {
  const order = await getReconfirmOrder(id, payload.phone);
  if (OrderStatusService.toOrderStatusKey(order.status) === "confirmed") {
    return {
      alreadyConfirmed: true,
      maskedPhone: maskPhone(order.customerPhone),
      order: toPublicOrder(order),
    };
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const meta = parseAnyOrderMeta(order.note);
  meta.__frontendOrder = meta.__frontendOrder !== false;
  meta.reconfirmOtp = {
    hash: hashOrderOtp(order.Id, order.customerPhone, otp),
    expiresAt,
    attempts: 0,
    sentAt: new Date().toISOString(),
    phone: normalizePhone(order.customerPhone),
  };

  await order.update({ note: JSON.stringify(meta) });

  const smsText = `Your ${order.orderId} confirmation OTP is ${otp}. This code will expire in 5 minutes.`;
  const smsResult = await SmsMarketingService.sendTransactionalSms(order.customerPhone, smsText);
  if (!smsResult?.sent) {
    const providerError = smsResult?.errors?.[0]?.response || smsResult?.errors?.[0]?.error;
    throw new ApiError(502, providerError || "OTP SMS could not be sent. Please check SMS gateway settings.");
  }

  return {
    alreadyConfirmed: false,
    maskedPhone: maskPhone(order.customerPhone),
    expiresAt,
  };
};

const verifyOrderReconfirmOtpInDB = async (id, payload = {}) => {
  const order = await getReconfirmOrder(id, payload.phone);
  if (OrderStatusService.toOrderStatusKey(order.status) === "confirmed") {
    return toPublicOrder(order);
  }

  const otp = String(payload.otp || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(otp)) throw new ApiError(400, "Valid 6 digit OTP is required");

  const meta = parseAnyOrderMeta(order.note);
  const otpMeta = meta.reconfirmOtp || {};
  if (!otpMeta.hash || !otpMeta.expiresAt) {
    throw new ApiError(400, "OTP not requested yet");
  }
  if (new Date(otpMeta.expiresAt).getTime() < Date.now()) {
    throw new ApiError(400, "OTP expired. Please request a new OTP");
  }
  if (Number(otpMeta.attempts || 0) >= 5) {
    throw new ApiError(429, "Too many OTP attempts. Please request a new OTP");
  }

  const expectedHash = hashOrderOtp(order.Id, order.customerPhone, otp);
  if (expectedHash !== otpMeta.hash) {
    meta.reconfirmOtp = {
      ...otpMeta,
      attempts: Number(otpMeta.attempts || 0) + 1,
    };
    await order.update({ note: JSON.stringify(meta) });
    throw new ApiError(400, "Invalid OTP");
  }

  delete meta.reconfirmOtp;
  meta.reconfirmedAt = new Date().toISOString();
  await order.update({
    status: "confirmed",
    note: JSON.stringify(meta),
  });

  NotificationService.createForRoles(
    ["superAdmin", "admin", "cs"],
    {
      title: "Order re-confirmed",
      message: `${order.orderId} — ${order.customerName || "Customer"} verified by OTP`,
      type: "order_status",
      priority: "high",
      url: "/#page=orders&orderStatus=confirmed",
      data: { orderId: order.Id, invoiceId: order.orderId, status: "confirmed" },
    },
  ).catch((error) => console.error("Order reconfirm notification failed:", error.message));

  return toPublicOrder({ ...order.get({ plain: true }), status: "confirmed", note: JSON.stringify(meta) });
};

const ORDER_META_UPDATE_KEYS = [
  "alternativePhone",
  "customerEmail",
  "courierNote",
  "packingNote",
  "adminNotes",
  "customerNotes",
  "payments",
  "advance",
  "attachments",
  "pathaoLocation",
  "paymentMethod",
  "customerAddress",
];

const addOrderAttachmentInDB = async (id, file, actor = {}) => {
  if (!file) throw new ApiError(400, "File is required");
  const order = await Order.findByPk(id);
  if (!order) throw new ApiError(404, "Order not found");
  const meta = parseMetaKeepingLegacyNote(order.note);
  const attachment = {
    file: file.filename || file.path,
    name: file.originalname || file.filename,
    by: getUserDisplayName(actor),
    at: new Date().toISOString(),
  };
  meta.attachments = [...(Array.isArray(meta.attachments) ? meta.attachments : []), attachment];
  await order.update({ note: JSON.stringify(meta) });
  return attachment;
};

const updateOrderInDB = async (id, payload) => {
  const order = await Order.findByPk(id);
  if (!order) throw new ApiError(404, "Order not found");
  const { stockLedger, metaUpdates, ...next } = payload;
  // Order-page fields that live in the note; merged into the stored note so other data stays.
  if (metaUpdates && typeof metaUpdates === "object") {
    const meta = parseMetaKeepingLegacyNote(next.note ?? order.note);
    ORDER_META_UPDATE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(metaUpdates, key)) meta[key] = metaUpdates[key];
    });
    next.note = JSON.stringify(meta);
  }
  if (next.source && !next.orderSource) {
    next.orderSource = next.source;
  }
  if (Object.prototype.hasOwnProperty.call(next, "note") && !next.orderSource) {
    const sourceFromNote = extractOrderSourceFromNote(next.note);
    if (sourceFromNote) next.orderSource = sourceFromNote;
  }
  if (next.status !== undefined) {
    next.status = await validateOrderStatus(next.status);
  }
  if (next.fraudStatus !== undefined) {
    const fraudStatus = normalizeFraudStatus(next.fraudStatus);
    if (fraudStatus && !MANUAL_FRAUD_STATUSES.includes(fraudStatus)) {
      throw new ApiError(400, "Invalid fraud status. Valid: safe, fake");
    }
    next.fraudStatus = fraudStatus || null;
    next.fraudReason = next.fraudReason || null;
  }
  const addressFieldsChanged =
    Object.prototype.hasOwnProperty.call(next, "customerArea") ||
    Object.prototype.hasOwnProperty.call(next, "customerDistrict");
  if (addressFieldsChanged && !Object.prototype.hasOwnProperty.call(next, "note")) {
    // Website orders freeze the checkout-time address inside note.customerAddress,
    // which every read path (customer tracking, invoice, courier shipment) prefers
    // over the customerArea/customerDistrict columns — keep it in sync on edit.
    const meta = parseOrderMeta(order.note);
    if (meta.__frontendOrder) {
      const hasArea = Object.prototype.hasOwnProperty.call(next, "customerArea");
      const hasDistrict = Object.prototype.hasOwnProperty.call(next, "customerDistrict");
      // Admin's order-edit form sends the full address as a single customerArea
      // string (no separate district) — don't re-append the stale district in that case.
      const mergedAddress = hasArea && !hasDistrict
        ? String(next.customerArea || "").trim()
        : [hasArea ? next.customerArea : order.customerArea, hasDistrict ? next.customerDistrict : order.customerDistrict]
            .filter(Boolean)
            .join(", ");
      if (mergedAddress) {
        next.note = JSON.stringify({ ...meta, customerAddress: mergedAddress });
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(next, "orderTag") || next.orderSource !== undefined) {
    const meta = parseMetaKeepingLegacyNote(next.note ?? order.note);
    if (Object.prototype.hasOwnProperty.call(next, "orderTag")) {
      meta.orderTag = typeof next.orderTag === "string" ? next.orderTag.trim() : "";
      delete next.orderTag;
    }
    if (next.orderSource !== undefined) {
      meta.orderSource = next.orderSource;
      meta.source = next.orderSource;
    }
    next.note = JSON.stringify(meta);
  }
  if (Array.isArray(next.items)) {
    // Staff edited the order lines: store them in the order meta (which also drives
    // variant stock via the order hooks) and recompute the totals.
    const items = await resolveStaffItems(next.items);
    const totals = calculateStaffTotals(items, next);
    const meta = parseAnyOrderMeta(next.note ?? order.note);
    const advance = next.advance !== undefined ? Math.max(0, Number(next.advance) || 0) : Number(order.advance || 0);
    next.note = JSON.stringify({
      ...meta,
      __frontendOrder: meta.__frontendOrder ?? true,
      // Items as first ordered, kept once so reports can tell them from later additions.
      ...(meta.originalItems || !Array.isArray(meta.items) ? {} : { originalItems: meta.items }),
      items,
      ...totals,
      advance,
    });
    next.productName = buildItemsProductName(items) || order.productName;
    next.productImage = items[0]?.image || order.productImage;
    next.quantity = items.reduce((sum, item) => sum + item.qty, 0);
    next.totalBill = totals.total;
    next.advance = advance;
  }
  delete next.items;
  delete next.subtotal;
  delete next.deliveryCharge;
  delete next.discount;
  if (Object.prototype.hasOwnProperty.call(next, "fraudStatus")) {
    const { fraudStatus, fraudReason, ...otherUpdates } = next;
    if (Object.keys(otherUpdates).length) {
      await order.update(otherUpdates);
    }
    await Order.update(
      {
        fraudStatus,
        fraudReason,
      },
      {
        where: { customerPhone: order.customerPhone },
        paranoid: true,
      },
    );
    await order.reload();
  } else {
    await order.update(next);
  }
  const updatedOrder = await Order.findByPk(id, {
    include: ORDER_ASSIGNMENT_INCLUDES,
  });
  const plain = updatedOrder?.get
    ? updatedOrder.get({ plain: true })
    : typeof order.toJSON === "function"
      ? order.toJSON()
      : order;
  return { ...withAssignmentUsers(plain), fraudGuard: await getFraudGuardForOrder(plain) };
};

// Orders can be assigned to any active staff account (admins included); customers are "user".
const ASSIGNABLE_USER_CONDITIONS = [
  db.sequelize.where(fn("LOWER", col("role")), { [Op.ne]: "user" }),
  db.sequelize.where(fn("LOWER", col("status")), "active"),
];

const getAssignableEmployeesFromDB = async () => {
  const employees = await User.findAll({
    where: { [Op.and]: ASSIGNABLE_USER_CONDITIONS },
    attributes: ["Id", "FirstName", "LastName", "Email", "Phone", "role", "status"],
    order: [["FirstName", "ASC"], ["createdAt", "DESC"]],
    paranoid: true,
  });

  return employees.map((employee) => {
    const plain = typeof employee.toJSON === "function" ? employee.toJSON() : employee;
    return {
      ...plain,
      name: getUserDisplayName(plain),
    };
  });
};

const AUTO_DISTRIBUTION_NAME = "Auto Distribution";
let distributionQueue = Promise.resolve();

// Hands an unassigned order to the next employee with Order Distribution on: the one
// whose latest assignment is oldest, so orders go round in turn. Runs one at a time
// so two orders arriving together do not land on the same employee.
const autoDistributeOrder = (orderId) => {
  const run = distributionQueue.then(async () => {
    const employees = await User.findAll({
      where: { [Op.and]: [{ orderDistribution: true }, ...ASSIGNABLE_USER_CONDITIONS] },
      attributes: ["Id", "FirstName", "LastName", "Email", "Phone"],
      order: [["Id", "ASC"]],
      raw: true,
      paranoid: true,
    });
    if (!employees.length) return null;

    const lastAssigned = await Order.findAll({
      attributes: ["assignedEmployeeId", [fn("MAX", col("assignedAt")), "lastAt"]],
      where: { assignedEmployeeId: { [Op.in]: employees.map((employee) => employee.Id) } },
      group: ["assignedEmployeeId"],
      raw: true,
      paranoid: false,
    });
    const lastAt = new Map(lastAssigned.map((row) => [Number(row.assignedEmployeeId), new Date(row.lastAt).getTime() || 0]));
    const next = employees.reduce((best, employee) =>
      (lastAt.get(employee.Id) || 0) < (lastAt.get(best.Id) || 0) ? employee : best);

    const [updated] = await Order.update(
      {
        assignedEmployeeId: next.Id,
        assignedEmployeeName: getUserDisplayName(next),
        assignedById: null,
        assignedByName: AUTO_DISTRIBUTION_NAME,
        assignedAt: new Date(),
      },
      { where: { Id: orderId, assignedEmployeeId: { [Op.is]: null } } },
    );
    return updated ? next.Id : null;
  });
  distributionQueue = run.catch(() => {});
  return run;
};

const bulkAssignOrdersToEmployeeInDB = async (orderIds = [], employeeId, actor = {}) => {
  const ids = [...new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((id) => Number(id))
      .filter(Boolean),
  )];
  if (!ids.length) throw new ApiError(400, "Order IDs are required");

  const employee = await User.findOne({
    where: {
      [Op.and]: [
        { Id: Number(employeeId) },
        ...ASSIGNABLE_USER_CONDITIONS,
      ],
    },
    attributes: ["Id", "FirstName", "LastName", "Email", "Phone", "role", "status"],
    paranoid: true,
  });
  if (!employee) throw new ApiError(404, "Active staff user not found");

  const employeePlain = employee.get({ plain: true });
  const employeeName = getUserDisplayName(employeePlain);
  const actorName = getUserDisplayName(actor);

  const [updatedCount] = await Order.update(
    {
      assignedEmployeeId: employeePlain.Id,
      assignedEmployeeName: employeeName,
      assignedById: actor.Id || null,
      assignedByName: actorName,
      assignedAt: new Date(),
    },
    {
      where: { Id: { [Op.in]: ids } },
      paranoid: true,
    },
  );

  const updatedOrders = await Order.findAll({
    where: { Id: { [Op.in]: ids } },
    include: ORDER_ASSIGNMENT_INCLUDES,
    order: [["Id", "DESC"]],
    paranoid: true,
  });

  return {
    assigned: updatedCount,
    employee: {
      Id: employeePlain.Id,
      name: employeeName,
    },
    orders: updatedOrders.map((order) => withAssignmentUsers(order.get({ plain: true }))),
  };
};

const deleteOrderFromDB = async (id) => {
  const order = await Order.findByPk(id);
  if (!order) throw new ApiError(404, "Order not found");
  await order.destroy();
  return { message: "Order deleted successfully" };
};

const sendOrderToSteadfastInDB = async (id, options = {}) => {
  const order = await getOrderForCourier(id);
  if (!canSendToCourier(order)) {
    throw new ApiError(400, "Only confirmed orders can be sent to Steadfast");
  }
  const existing = getSteadfastMeta(order);
  if (existing.trackingCode && !options.force) {
    return {
      alreadySent: true,
      orderId: order.Id,
      invoice: order.orderId,
      consignmentId: existing.consignmentId,
      trackingCode: existing.trackingCode,
      steadfastStatus: existing.status,
    };
  }

  const payload = compactObject(buildSteadfastOrderPayload(order, options));
  const response = await steadfastRequest("/create_order", { method: "POST", body: payload });
  const consignment = response?.consignment || response || {};
  const steadfastStatus = consignment.status || response?.delivery_status || "in_review";
  const orderStatus = mapSteadfastStatusToOrderStatus(steadfastStatus) || "in_courier";

  await order.update({
    courier: "Steadfast",
    status: orderStatus,
    note: mergeCourierMeta(order, "steadfast", {
      invoice: payload.invoice,
      consignmentId: consignment.consignment_id || consignment.consignmentId || null,
      trackingCode: consignment.tracking_code || consignment.trackingCode || null,
      status: steadfastStatus,
      lastPayload: payload,
      lastResponse: consignment,
    }),
  });

  return {
    orderId: order.Id,
    invoice: order.orderId,
    status: order.status,
    consignmentId: consignment.consignment_id || consignment.consignmentId || null,
    trackingCode: consignment.tracking_code || consignment.trackingCode || null,
    steadfastStatus,
    response,
  };
};

const sendOrderToPathaoInDB = async (id, options = {}) => {
  const order = await getOrderForCourier(id);
  if (!canSendToCourier(order)) {
    throw new ApiError(400, "Only confirmed orders can be sent to Pathao");
  }
  const existing = getPathaoMeta(order);
  if ((existing.consignmentId || existing.trackingCode) && !options.force) {
    return {
      alreadySent: true,
      orderId: order.Id,
      invoice: order.orderId,
      consignmentId: existing.consignmentId,
      trackingCode: existing.trackingCode,
      pathaoStatus: existing.status,
    };
  }

  const config = await getPathaoConfig();
  const token = await pathaoToken(config);
  const payload = compactObject(buildPathaoOrderPayload(order, config, options));
  const response = await pathaoRequest("/aladdin/api/v1/orders", {
    method: "POST",
    body: payload,
    config,
    token,
  });
  const pathaoOrder = response?.data || response || {};
  const pathaoStatus = pathaoOrder.order_status || pathaoOrder.status || response?.message || "created";
  const orderStatus = mapPathaoStatusToOrderStatus(pathaoStatus) || "in_courier";
  const consignmentId =
    pathaoOrder.consignment_id ||
    pathaoOrder.consignmentId ||
    pathaoOrder.tracking_number ||
    pathaoOrder.trackingNumber ||
    null;

  await order.update({
    courier: "Pathao",
    status: orderStatus,
    note: mergeCourierMeta(order, "pathao", {
      invoice: payload.merchant_order_id,
      consignmentId,
      trackingCode: consignmentId,
      status: pathaoStatus,
      lastPayload: payload,
      lastResponse: pathaoOrder,
    }),
  });

  return {
    orderId: order.Id,
    invoice: order.orderId,
    status: order.status,
    consignmentId,
    trackingCode: consignmentId,
    pathaoStatus,
    response,
  };
};

const bulkSendOrdersToSteadfastInDB = async (orderIds = [], options = {}) => {
  const ids = [...new Set((orderIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, "At least one order id is required");
  if (ids.length > 500) throw new ApiError(400, "Steadfast bulk order limit is 500");

  const orders = await Order.findAll({
    where: { Id: { [Op.in]: ids } },
    paranoid: true,
  });
  const orderMap = new Map(orders.map((order) => [Number(order.Id), order]));
  const payloadItems = [];
  const skipped = [];

  ids.forEach((id) => {
    const order = orderMap.get(id);
    if (!order) {
      skipped.push({ orderId: id, status: "error", message: "Order not found" });
      return;
    }
    const existing = getSteadfastMeta(order);
    if (existing.trackingCode && !options.force) {
      skipped.push({
        orderId: id,
        invoice: order.orderId,
        status: "skipped",
        message: "Already sent to Steadfast",
        trackingCode: existing.trackingCode,
      });
      return;
    }
    if (!canSendToCourier(order)) {
      skipped.push({
        orderId: id,
        invoice: order.orderId,
        status: "skipped",
        message: "Only confirmed orders can be sent to Steadfast",
        orderStatus: order.status,
      });
      return;
    }
    payloadItems.push({ order, payload: compactObject(buildSteadfastOrderPayload(order, options)) });
  });

  if (!payloadItems.length) return { sent: [], skipped };

  const response = await steadfastRequest("/create_order/bulk-order", {
    method: "POST",
    body: { data: JSON.stringify(payloadItems.map((item) => item.payload)) },
  });
  const rows = Array.isArray(response) ? response : response?.data || [];
  const sent = [];

  await Promise.all(payloadItems.map(async ({ order, payload }, index) => {
    const row = rows[index] || {};
    const successful = String(row.status || "").toLowerCase() === "success" || row.tracking_code || row.consignment_id;
    if (!successful) {
      skipped.push({
        orderId: order.Id,
        invoice: order.orderId,
        status: "error",
        message: row.message || "Steadfast rejected this order",
        response: row,
      });
      return;
    }

    await order.update({
      courier: "Steadfast",
      status: "in_courier",
      note: mergeCourierMeta(order, "steadfast", {
        invoice: payload.invoice,
        consignmentId: row.consignment_id || null,
        trackingCode: row.tracking_code || null,
        status: row.delivery_status || row.status || "success",
        lastPayload: payload,
        lastResponse: row,
      }),
    });
    sent.push({
      orderId: order.Id,
      invoice: order.orderId,
      consignmentId: row.consignment_id || null,
      trackingCode: row.tracking_code || null,
      status: row.status || "success",
    });
  }));

  return { sent, skipped, response };
};

const bulkSendOrdersToPathaoInDB = async (orderIds = [], options = {}) => {
  const ids = [...new Set((orderIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, "At least one order id is required");

  const orders = await Order.findAll({
    where: { Id: { [Op.in]: ids } },
    paranoid: true,
  });
  const orderMap = new Map(orders.map((order) => [Number(order.Id), order]));
  const config = await getPathaoConfig();
  const token = await pathaoToken(config);
  const sent = [];
  const skipped = [];

  for (const id of ids) {
    const order = orderMap.get(id);
    if (!order) {
      skipped.push({ orderId: id, status: "error", message: "Order not found" });
      continue;
    }

    const existing = getPathaoMeta(order);
    if ((existing.consignmentId || existing.trackingCode) && !options.force) {
      skipped.push({
        orderId: id,
        invoice: order.orderId,
        status: "skipped",
        message: "Already sent to Pathao",
        trackingCode: existing.trackingCode || existing.consignmentId,
      });
      continue;
    }

    if (!canSendToCourier(order)) {
      skipped.push({
        orderId: id,
        invoice: order.orderId,
        status: "skipped",
        message: "Only confirmed orders can be sent to Pathao",
        orderStatus: order.status,
      });
      continue;
    }

    try {
      const payload = compactObject(buildPathaoOrderPayload(order, config, options));
      const response = await pathaoRequest("/aladdin/api/v1/orders", {
        method: "POST",
        body: payload,
        config,
        token,
      });
      const pathaoOrder = response?.data || response || {};
      const pathaoStatus = pathaoOrder.order_status || pathaoOrder.status || response?.message || "created";
      const consignmentId =
        pathaoOrder.consignment_id ||
        pathaoOrder.consignmentId ||
        pathaoOrder.tracking_number ||
        pathaoOrder.trackingNumber ||
        null;

      await order.update({
        courier: "Pathao",
        status: mapPathaoStatusToOrderStatus(pathaoStatus) || "in_courier",
        note: mergeCourierMeta(order, "pathao", {
          invoice: payload.merchant_order_id,
          consignmentId,
          trackingCode: consignmentId,
          status: pathaoStatus,
          lastPayload: payload,
          lastResponse: pathaoOrder,
        }),
      });
      sent.push({
        orderId: order.Id,
        invoice: order.orderId,
        consignmentId,
        trackingCode: consignmentId,
        status: pathaoStatus,
      });
    } catch (error) {
      skipped.push({
        orderId: order.Id,
        invoice: order.orderId,
        status: "error",
        message: error.message || "Pathao rejected this order",
      });
    }
  }

  return { sent, skipped };
};

// A courier sync never moves a Return Received order back to returned/cancelled.
const courierStatusUpdate = (order, orderStatus) => {
  if (!orderStatus) return {};
  if (order.status === ORDER_STATUS.RETURN_RECEIVED && ["returned", "cancelled"].includes(orderStatus)) return {};
  return { status: orderStatus };
};

// Compare the snapshot so a slow provider response cannot overwrite a newer edit.
const saveCourierSync = async (order, values, automatic) => {
  if (!automatic) return order.update(values);
  // Bulk updates skip instance hooks, so record the status change here.
  if (values.status && values.status !== order.status) {
    values = { ...values, note: appendStatusHistory(values.note ?? order.note, order.status, values.status) };
  }
  const [updated] = await Order.update(values, { where: {
    Id: order.Id, status: order.status, courier: order.courier, note: order.note,
  } });
  if (!updated) return;
  const previousStatus = order.status;
  Object.assign(order, values);
  // Bulk updates skip the ERP sync and reward points hooks too.
  if (values.status) queueOrderPush(order.Id);
  if (values.status && values.status !== previousStatus) {
    RewardService.syncOrderRewards(order, previousStatus).catch((error) =>
      console.error("Reward points sync failed:", error.message));
  }
};

const syncSteadfastStatusInDB = async (id, { automatic = false } = {}) => {
  const order = await getOrderForCourier(id);
  if (automatic && !["in_courier", "on_hold"].includes(order.status)) return;
  const meta = getSteadfastMeta(order);
  const lookupValue = meta.consignmentId || meta.trackingCode || order.orderId;
  const path = meta.consignmentId
    ? `/status_by_cid/${encodeURIComponent(meta.consignmentId)}`
    : meta.trackingCode
      ? `/status_by_trackingcode/${encodeURIComponent(meta.trackingCode)}`
      : `/status_by_invoice/${encodeURIComponent(order.orderId)}`;

  const response = await steadfastRequest(path);
  const steadfastStatus = response?.delivery_status || response?.status_text || response?.status || "";
  const orderStatus = mapSteadfastStatusToOrderStatus(steadfastStatus);
  await saveCourierSync(order, {
    ...courierStatusUpdate(order, orderStatus),
    courier: "Steadfast",
    note: mergeCourierMeta(order, "steadfast", {
      ...meta,
      lookupValue,
      status: steadfastStatus,
      lastStatusResponse: response,
    }),
  }, automatic);

  return {
    orderId: order.Id,
    invoice: order.orderId,
    status: order.status,
    steadfastStatus,
    response,
  };
};

const syncPathaoStatusInDB = async (id, { automatic = false } = {}) => {
  const order = await getOrderForCourier(id);
  if (automatic && !["in_courier", "on_hold"].includes(order.status)) return;
  const meta = getPathaoMeta(order);
  const lookupValue = meta.consignmentId || meta.trackingCode;
  if (!lookupValue) {
    throw new ApiError(400, "Pathao consignment id is required to sync status");
  }

  const response = await pathaoRequestFirst([
    `/aladdin/api/v1/orders/${encodeURIComponent(lookupValue)}/info`,
    `/aladdin/api/v1/orders/${encodeURIComponent(lookupValue)}`,
  ]);
  const data = response?.data || response || {};
  const pathaoStatus =
    data.order_status_slug ||
    data.order_status ||
    data.status_slug ||
    data.status ||
    response?.order_status_slug ||
    response?.order_status ||
    response?.status ||
    "";
  const orderStatus = mapPathaoStatusToOrderStatus(pathaoStatus);

  await saveCourierSync(order, {
    ...courierStatusUpdate(order, orderStatus),
    courier: "Pathao",
    note: mergeCourierMeta(order, "pathao", {
      ...meta,
      lookupValue,
      status: pathaoStatus,
      lastStatusResponse: data,
    }),
  }, automatic);

  return {
    orderId: order.Id,
    invoice: order.orderId,
    status: order.status,
    pathaoStatus,
    response,
  };
};

const getSteadfastBalanceFromProvider = () => steadfastRequest("/get_balance");

const createSteadfastReturnRequestInDB = async (id, reason = "") => {
  const order = await getOrderForCourier(id);
  const meta = getSteadfastMeta(order);
  const consignment = meta.consignmentId || meta.trackingCode || order.orderId;
  const response = await steadfastRequest("/create_return_request", {
    method: "POST",
    body: compactObject({
      consignment_id: consignment,
      reason: String(reason || "").trim() || undefined,
    }),
  });
  await order.update({
    note: mergeCourierMeta(order, "steadfast", {
      ...meta,
      returnReason: String(reason || "").trim() || meta.returnReason || null,
      lastReturnRequest: response,
    }),
  });
  return response;
};

const getSteadfastReturnRequestsFromProvider = () => steadfastRequest("/get_return_requests");

const getSteadfastPaymentsFromProvider = (paymentId) =>
  steadfastRequest(paymentId ? `/payments/${encodeURIComponent(paymentId)}` : "/payments");

const getSteadfastPoliceStationsFromProvider = () => steadfastRequest("/police_stations");

const updateOrderStatusInDB = async (id, status, actorUserId) => {
  const nextStatus = await validateOrderStatus(status);
  const order = await Order.findByPk(id);
  if (!order) throw new ApiError(404, "Order not found");
  await order.update({ status: nextStatus });
  await NotificationService.createForRoles(
    ["superAdmin", "admin", "cs", "logistics"],
    {
      title: "Order status updated",
      message: `${order.orderId || `Order #${order.Id}`} is now ${nextStatus}`,
      type: "order_status",
      priority: ["cancelled", ...RETURN_STATUSES, "incomplete"].includes(nextStatus) ? "high" : "normal",
      url: `/#page=orders&orderStatus=${encodeURIComponent(nextStatus)}`,
      data: { orderId: order.Id, invoiceId: order.orderId, status: nextStatus },
      excludeUserId: actorUserId,
    },
  ).catch((error) => console.error("Order status notification failed:", error.message));
  return order;
};

// Order totals for a customer phone, for Create Order before the order exists.
const getCustomerSummaryByPhone = async (phone) => {
  const history = (await getCustomerOrderHistoryByPhone([phone])).get(phoneHistoryKey(phone)) || [];
  return summarizeCustomerHistory(history);
};

// Contact details from the customer's latest order, to prefill a new order.
const getLastCustomerByPhone = async (phone) => {
  const key = phoneHistoryKey(phone);
  if (key.length < 6) return null;
  const phoneExpr = "RIGHT(REGEXP_REPLACE(`Order`.`customerPhone`, '[^0-9]', ''), 10)";
  const row = await Order.findOne({
    attributes: ["customerName", "customerArea", "customerDistrict", "note"],
    where: db.sequelize.where(literal(phoneExpr), key),
    order: [["Id", "DESC"]],
    raw: true,
  });
  if (!row) return null;
  const meta = parseAnyOrderMeta(row.note);
  return {
    name: row.customerName || "",
    address: row.customerArea || "",
    district: row.customerDistrict || "",
    altPhone: meta.alternativePhone || "",
    email: meta.customerEmail || "",
    pathaoLocation: meta.pathaoLocation || null,
  };
};

const OrderService = {
  createOrderInDB,
  getCustomerSummaryByPhone,
  getLastCustomerByPhone,
  createStaffOrderInDB,
  saveIncompleteOrderInDB,
  getOrdersFromDB,
  getOrderFilterOptionsFromDB,
  getOrderReportFromDB,
  getSalesSummaryFromDB,
  getPackingListFromDB,
  bulkOrderActionInDB,
  sendSmsToOrdersInDB,
  markOrdersPrintedInDB,
  getPathaoCitiesFromProvider,
  getPathaoZonesFromProvider,
  getOrderStatusCountsFromDB,
  getOrderByIdFromDB,
  addOrderAttachmentInDB,
  trackOrdersByPhoneFromDB,
  getCustomerOrderHistoryFromDB,
  sendOrderReconfirmOtpInDB,
  verifyOrderReconfirmOtpInDB,
  updateOrderInDB,
  getAssignableEmployeesFromDB,
  bulkAssignOrdersToEmployeeInDB,
  deleteOrderFromDB,
  updateOrderStatusInDB,
  sendOrderToSteadfastInDB,
  sendOrderToPathaoInDB,
  bulkSendOrdersToSteadfastInDB,
  bulkSendOrdersToPathaoInDB,
  syncSteadfastStatusInDB,
  syncPathaoStatusInDB,
  getSteadfastBalanceFromProvider,
  createSteadfastReturnRequestInDB,
  getSteadfastReturnRequestsFromProvider,
  getSteadfastPaymentsFromProvider,
  getSteadfastPoliceStationsFromProvider,
};

module.exports = OrderService;
