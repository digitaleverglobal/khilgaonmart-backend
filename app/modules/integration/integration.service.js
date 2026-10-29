const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const crypto = require("crypto");
const { Op } = require("sequelize");
const OrderService = require("../order/order.service");

const Order = db.order;
const Product = db.product;
const Variation = db.variation;
const { normalizeVariantOptions } = require("../../../shared/productVariants");

const isNumericKeyMap = (value) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
};

const normalizeSettingData = (value, depth = 0) => {
  if (!value || depth > 5) return {};
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return normalizeSettingData(JSON.parse(trimmed), depth + 1);
    } catch {
      return {};
    }
  }
  if (isNumericKeyMap(value)) {
    const text = Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .join("");
    return normalizeSettingData(text, depth + 1);
  }
  if (Array.isArray(value) || typeof value !== "object") return {};
  return value;
};

const load = async (type) => {
  const row = await db.siteSetting.findOne({ where: { settingType: type } });
  return normalizeSettingData(row?.data);
};
const request = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
    if (!response.ok) throw new ApiError(400, `Provider rejected credentials (${response.status})`);
    return data;
  } finally { clearTimeout(timer); }
};
const required = (config, fields) => {
  const missing = fields.filter((field) => !String(config?.[field] || "").trim());
  if (missing.length) throw new ApiError(400, `Missing credential(s): ${missing.join(", ")}`);
};

const testSms = async (provider, overrideConfig) => {
  const config = Object.keys(normalizeSettingData(overrideConfig)).length
    ? normalizeSettingData(overrideConfig)
    : await load("sms_gateway");
  const gateway = provider || config.type || config.gatewayType || "";
  if (!config || !Object.keys(config).length) throw new ApiError(400, "Configuration is empty");
  if (config.status === false) throw new ApiError(400, "SMS gateway is disabled");
  if (!gateway) throw new ApiError(400, "Missing credential(s): type");

  if (gateway === "ssl_wireless") {
    required({ ...config, apiToken: config.apiToken || config.apiKey }, ["apiToken", "sid"]);
  } else if (gateway === "bdbulksms") {
    required({ ...config, apiKey: config.apiKey || config.api_key || config.token || config.apiToken || config.password }, ["apiKey", "senderId"]);
  } else if (gateway === "twilio") {
    required(config, ["accountSid", "authToken", "fromNumber"]);
  } else {
    throw new ApiError(400, `Unsupported SMS gateway type: ${gateway}`);
  }

  return {
    provider: gateway,
    configured: true,
    note: "Credentials saved; OTP SMS will use this gateway.",
  };
};

const testCourier = async (provider) => {
  const config = (await load("courier_api"))[provider];
  if (!config) throw new ApiError(404, "Courier configuration not found");
  if (provider === "steadfast") {
    required(config, ["apiKey", "secretKey"]);
    const url = new URL(config.url || "https://portal.packzy.com/api/v1/create_order");
    url.pathname = "/api/v1/get_balance";
    await request(url, { headers: { "Api-Key": config.apiKey, "Secret-Key": config.secretKey, Accept: "application/json" } });
  } else {
    const clientId = config.clientId || config.apiKey;
    const clientSecret = config.clientSecret || config.secretKey;
    required({ ...config, clientId, clientSecret }, ["clientId", "clientSecret", "username", "password", "url"]);
    const tokenUrl = new URL(config.url || "https://api-hermes.pathao.com/aladdin/api/v1/orders");
    tokenUrl.pathname = "/aladdin/api/v1/issue-token";
    const tokenResponse = await request(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        username: config.username,
        password: config.password,
        grant_type: "password",
      }),
    });
    const accessToken = tokenResponse?.access_token || tokenResponse?.data?.access_token || tokenResponse?.token;
    if (!accessToken) throw new ApiError(400, "Pathao access token missing from response");
    const storesUrl = new URL(config.url); storesUrl.pathname = "/aladdin/api/v1/stores";
    await request(storesUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  }
  return { provider, connected: true };
};

const testPayment = async (provider) => {
  const config = (await load("payment_gateway"))[provider];
  if (!config) throw new ApiError(404, "Gateway configuration not found");
  if (provider === "shurjopay") {
    required(config, ["userName", "password", "baseUrl"]);
    await request(`${config.baseUrl.replace(/\/$/, "")}/get_token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ username: config.userName, password: config.password }) });
  } else {
    required(config, ["userName", "password", "appKey", "appSecret", "baseUrl"]);
    await request(`${config.baseUrl.replace(/\/$/, "")}/tokenized/checkout/token/grant`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", username: config.userName, password: config.password }, body: JSON.stringify({ app_key: config.appKey, app_secret: config.appSecret }) });
  }
  return { provider, connected: true };
};

const testConfiguration = async (type, provider, overrideConfig) => {
  if (type === "courier") return testCourier(provider);
  if (type === "payment") return testPayment(provider);
  if (type === "sms") return testSms(provider, overrideConfig);
  const config = await load("fraud_checker");
  if (!config || !Object.keys(config).length) throw new ApiError(400, "Configuration is empty");
  return { provider: provider || type, configured: true, note: "Credentials saved; live request requires a test recipient/order." };
};

const verifyWooCommerceSignature = (req) => {
  const secret = String(process.env.WOOCOMMERCE_WEBHOOK_SECRET || "").trim();
  if (!secret) throw new ApiError(500, "WooCommerce webhook secret is not configured");

  const signature = String(req.headers["x-wc-webhook-signature"] || "").trim();
  if (!signature) throw new ApiError(401, "Missing WooCommerce webhook signature");

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new ApiError(401, "Invalid WooCommerce webhook signature");
  }
};

const normalizeWooStatus = (status) => {
  const value = String(status || "").toLowerCase();
  if (["cancelled", "refunded", "failed"].includes(value)) return "cancelled";
  if (["completed"].includes(value)) return "delivered";
  if (["on-hold"].includes(value)) return "on_hold";
  return "pending";
};

const joinName = (...parts) => parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");

const getMetaValue = (metaData = [], ...keys) => {
  const normalizedKeys = keys.map((key) => String(key).toLowerCase());
  const found = metaData.find((item) =>
    normalizedKeys.includes(String(item?.key || "").toLowerCase()),
  );
  return found?.value || "";
};

const mapWooCommerceOrder = (order = {}) => {
  const billing = order.billing || {};
  const shipping = order.shipping || {};
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const shippingLines = Array.isArray(order.shipping_lines) ? order.shipping_lines : [];
  const feeLines = Array.isArray(order.fee_lines) ? order.fee_lines : [];

  const items = lineItems.map((item) => ({
    wooProductId: item.product_id || null,
    wooVariationId: item.variation_id || null,
    name: item.name || "WooCommerce Product",
    qty: Number(item.quantity || 1),
    price: Number(item.price || item.total || 0),
    total: Number(item.total || 0),
    image: item.image?.src || "",
    sku: item.sku || "",
  }));

  const quantity = items.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 1;
  const productName = items.map((item) => `${item.name} x${item.qty || 1}`).join(", ");
  const customerName = joinName(billing.first_name, billing.last_name) ||
    joinName(shipping.first_name, shipping.last_name) ||
    "WooCommerce Customer";
  const address = [
    shipping.address_1 || billing.address_1,
    shipping.address_2 || billing.address_2,
    shipping.city || billing.city,
    shipping.state || billing.state,
    shipping.postcode || billing.postcode,
    shipping.country || billing.country,
  ].filter(Boolean).join(", ");
  const deliveryCharge = shippingLines.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const extraFees = feeLines.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const advance = ["cod", "cash on delivery"].includes(String(order.payment_method || "").toLowerCase())
    ? 0
    : Number(order.total || 0);

  return {
    orderId: `WC-${order.id}`,
    customerName,
    customerPhone: billing.phone || shipping.phone || getMetaValue(order.meta_data, "_billing_phone", "phone"),
    ipAddress: order.customer_ip_address || getMetaValue(order.meta_data, "_customer_ip_address", "customer_ip_address") || null,
    deviceId: getMetaValue(order.meta_data, "deviceId", "device_id", "_device_id", "kafela_device_id") || null,
    customerArea: address || null,
    customerDistrict: shipping.city || billing.city || null,
    productName: productName || "WooCommerce Order",
    productImage: items[0]?.image || null,
    quantity,
    totalBill: Number(order.total || 0),
    advance,
    courier: shippingLines.map((item) => item.method_title || item.method_id).filter(Boolean).join(", ") || null,
    status: normalizeWooStatus(order.status),
    orderDate: String(order.date_created || new Date().toISOString()).slice(0, 10),
    note: JSON.stringify({
      __woocommerceOrder: true,
      source: "WooCommerce",
      orderSource: "WooCommerce",
      platform: "WooCommerce",
      wooCommerceOrderId: order.id,
      wooCommerceOrderNumber: order.number || null,
      wooCommerceStatus: order.status || null,
      customerAddress: address,
      customerEmail: billing.email || "",
      paymentMethod: order.payment_method || "",
      paymentMethodTitle: order.payment_method_title || "",
      paymentStatus: order.date_paid ? "paid" : "pending",
      items,
      subtotal: Number(order.total || 0) - deliveryCharge - extraFees,
      deliveryCharge,
      extraFees,
      discount: Number(order.discount_total || 0),
      total: Number(order.total || 0),
      currency: order.currency || "",
      sourceUrl: order._links?.self?.[0]?.href || "",
    }),
  };
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeProductStatus = (status) =>
  String(status || "").toLowerCase() === "publish" ? "Active" : "Inactive";

const normalizeStockAvailability = (status) => {
  const value = String(status || "").toLowerCase();
  if (value === "instock" || value === "in stock") return "in stock";
  if (value === "onbackorder") return "on backorder";
  return "out of stock";
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const buildWooProductNote = (product = {}) =>
  JSON.stringify({
    __woocommerceProduct: true,
    source: "WooCommerce",
    platform: "WooCommerce",
    wooCommerceProductId: product.id,
    wooCommerceType: product.type || null,
    wooCommerceStatus: product.status || null,
  });

const getWooProductImages = (product = {}) =>
  (Array.isArray(product.images) ? product.images : [])
    .map((image) => image?.src || "")
    .filter(Boolean);

const mapWooVariation = (item = {}, fallbackProduct = {}) => {
  const regularPrice = toNumberOrNull(item.regular_price);
  const salePrice = toNumberOrNull(item.sale_price);
  const price = toNumberOrNull(item.price);
  const attributes = Array.isArray(item.attributes)
    ? item.attributes
        .map((attribute) => [attribute.name, attribute.option].filter(Boolean).join(": "))
        .filter(Boolean)
    : [];

  const options = Array.isArray(item.attributes)
    ? Object.fromEntries(
        item.attributes
          .filter((attribute) => attribute.name && attribute.option)
          .map((attribute) => [attribute.name, attribute.option]),
      )
    : {};

  return {
    colorImage: item.image?.src || null,
    attribute: attributes.join(", ") || item.name || null,
    options: normalizeVariantOptions(options),
    availability: normalizeStockAvailability(item.stock_status || fallbackProduct.stock_status),
    oldPrice: regularPrice ?? price ?? salePrice,
    newPrice: salePrice ?? price ?? regularPrice,
    stock: Number(item.stock_quantity ?? fallbackProduct.stock_quantity ?? 0) || 0,
    sku: item.sku || fallbackProduct.sku || null,
  };
};

const mapWooProductToProductPayload = (product = {}) => {
  const images = getWooProductImages(product);
  return {
    name: product.name || `WooCommerce Product ${product.id}`,
    slug: product.slug || String(product.name || `woocommerce-product-${product.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    sku: product.sku || null,
    description: product.description || null,
    shortDescription: stripHtml(product.short_description),
    metaTitle: product.name || null,
    metaDescription: stripHtml(product.short_description || product.description),
    images: images.length ? images : null,
    file: images[0] || null,
    status: normalizeProductStatus(product.status),
    date: String(product.date_created || new Date().toISOString()).slice(0, 10),
    note: buildWooProductNote(product),
  };
};

const mapWooProductVariations = (product = {}, variationItems = []) => {
  if (variationItems.length) return variationItems.map((item) => mapWooVariation(item, product));
  return [mapWooVariation(product, product)];
};

const getWooCommerceApiConfig = () => {
  const siteUrl = String(process.env.WOOCOMMERCE_SITE_URL || "").replace(/\/+$/, "");
  const consumerKey = String(process.env.WOOCOMMERCE_CONSUMER_KEY || "").trim();
  const consumerSecret = String(process.env.WOOCOMMERCE_CONSUMER_SECRET || "").trim();
  if (!siteUrl || !consumerKey || !consumerSecret) return null;
  return { siteUrl, consumerKey, consumerSecret };
};

const fetchWooProductVariations = async (productId) => {
  const config = getWooCommerceApiConfig();
  if (!config || !productId) return [];

  const url = new URL(`${config.siteUrl}/wp-json/wc/v3/products/${productId}/variations`);
  url.searchParams.set("consumer_key", config.consumerKey);
  url.searchParams.set("consumer_secret", config.consumerSecret);
  url.searchParams.set("per_page", "100");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`WooCommerce variations request failed (${response.status})`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("WooCommerce variation sync skipped:", error.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
};

const parseProductNote = (note) => {
  if (!note || typeof note !== "string") return {};
  try {
    const parsed = JSON.parse(note);
    return parsed && parsed.__woocommerceProduct ? parsed : {};
  } catch {
    return {};
  }
};

const findWooCommerceProduct = async (product = {}) => {
  const conditions = [];
  if (product.id) {
    conditions.push({
      note: { [Op.like]: `%"wooCommerceProductId":${Number(product.id)}%` },
    });
  }
  if (product.sku) conditions.push({ sku: product.sku });
  if (!conditions.length) return null;

  const candidates = await Product.findAll({
    where: { [Op.or]: conditions },
    paranoid: false,
    limit: 20,
    order: [["Id", "DESC"]],
  });

  return candidates.find((row) => {
    const plain = row.toJSON ? row.toJSON() : row;
    const meta = parseProductNote(plain.note);
    return Number(meta.wooCommerceProductId) === Number(product.id);
  }) || candidates[0] || null;
};

const replaceWooProductVariations = async (productId, variations, transaction) => {
  await Variation.destroy({ where: { productId }, transaction });
  await Promise.all(
    variations.map((variation) =>
      Variation.create({ ...variation, productId }, { transaction }),
    ),
  );
};

const upsertWooCommerceProduct = async (product = {}, topic = "") => {
  if (!product.id) throw new ApiError(400, "WooCommerce product id is required");

  const existing = await findWooCommerceProduct(product);
  if (topic === "product.deleted") {
    if (!existing) return { ignored: true, wooCommerceProductId: product.id };
    await existing.update({ status: "Inactive", note: buildWooProductNote({ ...product, status: "deleted" }) });
    return { deleted: true, productId: existing.Id, wooCommerceProductId: product.id };
  }

  const variationItems = product.type === "variable"
    ? await fetchWooProductVariations(product.id)
    : [];
  const productPayload = mapWooProductToProductPayload(product);
  const variations = mapWooProductVariations(product, variationItems);

  return db.sequelize.transaction(async (transaction) => {
    let row = existing;
    if (row) {
      await row.update(productPayload, { transaction });
      if (row.deletedAt) await row.restore({ transaction });
    } else {
      row = await Product.create(productPayload, { transaction });
    }

    await replaceWooProductVariations(row.Id, variations, transaction);
    return {
      created: !existing,
      updated: Boolean(existing),
      productId: row.Id,
      wooCommerceProductId: product.id,
      variationCount: variations.length,
    };
  });
};

const receiveWooCommerceOrder = async (req) => {
  const topic = String(req.headers["x-wc-webhook-topic"] || "").toLowerCase();
  if (topic && topic !== "order.created") {
    return { ignored: true, topic };
  }

  verifyWooCommerceSignature(req);

  const wooOrder = req.body || {};
  if (!wooOrder.id) throw new ApiError(400, "WooCommerce order id is required");

  const orderId = `WC-${wooOrder.id}`;
  const existing = await Order.findOne({ where: { orderId }, paranoid: false });
  if (existing) {
    return {
      duplicate: true,
      orderId: existing.Id,
      invoiceId: existing.orderId,
      wooCommerceOrderId: wooOrder.id,
    };
  }

  const payload = mapWooCommerceOrder(wooOrder);
  if (!payload.customerPhone) {
    throw new ApiError(400, "WooCommerce customer phone is required");
  }

  const order = await OrderService.createOrderInDB(payload, { orderId });

  return {
    duplicate: false,
    orderId: order.Id,
    invoiceId: order.orderId,
    wooCommerceOrderId: wooOrder.id,
  };
};

const receiveWooCommerceProduct = async (req) => {
  const topic = String(req.headers["x-wc-webhook-topic"] || "").toLowerCase();
  if (topic && !["product.created", "product.updated", "product.deleted"].includes(topic)) {
    return { ignored: true, topic };
  }

  verifyWooCommerceSignature(req);
  return upsertWooCommerceProduct(req.body || {}, topic || "product.updated");
};

module.exports = { receiveWooCommerceOrder, receiveWooCommerceProduct, testConfiguration };
