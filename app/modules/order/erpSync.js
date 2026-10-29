const { Op } = require("sequelize");
const db = require("../../../models");
const { getVariationOptions } = require("../../../shared/productVariants");
const { toLedgerMap, STOCK_RELEASE_STATUSES } = require("./orderStock");

// Pushes orders to the Khilgaon Mart ERP: Courier Pickup / Sales becomes an
// Intransit Product (stock out), Returned becomes a Sales Return (stock in).
// The ERP keys every push by order and event, so repeating one is harmless.
// It also pulls ERP stock back into variant stock (see pullErpStock).
// Disabled unless ERP_SYNC_URL and ERP_SYNC_KEY are set.

const listEnv = (value, fallback) =>
  String(value || fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const INTRANSIT_STATUSES = listEnv(process.env.ERP_INTRANSIT_STATUSES, "courier_pickup_sales");
const RETURN_STATUSES = listEnv(process.env.ERP_RETURN_STATUSES, "returned,return_received");
const SYNC_STATUSES = [...INTRANSIT_STATUSES, ...RETURN_STATUSES];
// Finished orders whose stock is long gone; they never hold variant stock.
const FINAL_STATUSES = listEnv(process.env.ERP_FINAL_STATUSES, "delivered,hand_delivery_completed");
const CHUNK_SIZE = 25;

const getConfig = () => ({
  url: String(process.env.ERP_SYNC_URL || "").replace(/\/+$/, ""),
  key: String(process.env.ERP_SYNC_KEY || ""),
});
const isEnabled = () => {
  const { url, key } = getConfig();
  return Boolean(url && key);
};

// Variant stock is owned by the ERP once the sync is configured.
const erpOwnsStock = () => isEnabled() && String(process.env.ERP_STOCK_SYNC || "true").toLowerCase() !== "false";

const erpEvent = (status) => {
  const key = String(status || "").toLowerCase();
  if (INTRANSIT_STATUSES.includes(key)) return "intransit";
  if (RETURN_STATUSES.includes(key)) return "return";
  return null;
};

const parseObject = (value) => {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const BACKEND_BASE = String(
  process.env.BACKEND_URL || process.env.API_URL || process.env.BASE_URL || process.env.ORIGIN_URL || "",
).replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");

// Same rules as the admin's imageUrl(), so the ERP can show the picture.
const absoluteImage = (value) => {
  let src = value;
  if (Array.isArray(src)) [src] = src;
  if (typeof src === "string" && src.trim().startsWith("[")) [src] = Object.values(parseObject(src));
  src = String(src || "").trim();
  if (!src || /^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  if (src.startsWith("/")) return `${BACKEND_BASE}${src}`;
  const clean = src.replace(/^\/+/, "");
  return clean.startsWith("images/") ? `${BACKEND_BASE}/${clean}` : `${BACKEND_BASE}/images/${clean}`;
};

// "Weight: 1kg, Color: Red" -> "1kg / Red"; the ERP stores it as the variant size.
const optionValue = (options) => Object.values(options || {}).map((value) => String(value).trim()).filter(Boolean).join(" / ");
const variantValueOf = (item) => {
  const fromOptions = optionValue(parseObject(item.options));
  if (fromOptions) return fromOptions;
  return String(item.variant || "")
    .split(",")
    .map((part) => part.split(":").slice(-1)[0].trim())
    .filter(Boolean)
    .join(" / ");
};

// Products with a single variation are kept as plain ERP products.
const loadMultiVariantIds = async (productIds) => {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))];
  if (!ids.length) return new Set();
  const rows = await db.variation.findAll({
    attributes: ["productId"],
    where: { productId: { [Op.in]: ids } },
    raw: true,
  });
  const counts = new Map();
  rows.forEach((row) => counts.set(row.productId, (counts.get(row.productId) || 0) + 1));
  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => Number(id)));
};

const orderItems = (plain, meta) => {
  if (Array.isArray(meta.items) && meta.items.length) return meta.items;
  return [{
    name: plain.productName,
    image: plain.productImage,
    qty: plain.quantity || 1,
    price: Number(plain.totalBill || 0) / (Number(plain.quantity) || 1),
  }];
};

const buildPayload = (order, multiVariantIds) => {
  const plain = typeof order.toJSON === "function" ? order.toJSON() : order;
  const meta = parseObject(plain.note);
  const total = Number(meta.total ?? plain.totalBill ?? 0);
  return {
    event: erpEvent(plain.status),
    order: {
      id: plain.Id,
      invoice: plain.orderId,
      status: plain.status,
      customerName: plain.customerName,
      customerPhone: plain.customerPhone,
      customerAddress: meta.customerAddress || [plain.customerArea, plain.customerDistrict].filter(Boolean).join(", "),
      courier: plain.courier,
      orderSource: plain.orderSource,
      subtotal: Number(meta.subtotal ?? 0),
      deliveryCharge: Number(meta.deliveryCharge ?? 0),
      discount: Number(meta.discount || meta.less || 0),
      total,
      paid: Number(plain.advance || meta.advance || meta.paid || 0),
      orderDate: plain.orderDate || plain.createdAt,
      items: orderItems(plain, meta).map((item) => {
        const productId = Number(item.id || item.productId) || null;
        return {
          productId,
          name: item.name || item.productName || "Product",
          variant: item.variant || "",
          variantValue: multiVariantIds.has(productId) ? variantValueOf(item) || null : null,
          qty: Number(item.qty || item.quantity || 1) || 1,
          price: Number(item.price || item.unitPrice || 0),
          image: absoluteImage(item.image || item.productImage || item.images),
        };
      }),
    },
  };
};

const post = async (path, body) => {
  const { url, key } = getConfig();
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-shop-sync-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || `ERP responded ${response.status}`);
  return json.data;
};

const pushOrders = async (orders, logger = console) => {
  if (!isEnabled()) return [];
  const syncable = orders.filter((order) => erpEvent(order.status));
  if (!syncable.length) return [];

  const multiVariantIds = await loadMultiVariantIds(syncable.flatMap((order) =>
    orderItems(order, parseObject(order.note)).map((item) => item.id || item.productId)));
  const payloads = syncable.map((order) => buildPayload(order, multiVariantIds));

  const results = [];
  for (let start = 0; start < payloads.length; start += CHUNK_SIZE) {
    const chunk = payloads.slice(start, start + CHUNK_SIZE);
    try {
      results.push(...((await post("/orders", { orders: chunk })) || []));
    } catch (error) {
      logger.warn(`ERP order sync failed: ${error.message}`);
    }
  }
  return results;
};

const pushOrderById = async (id, logger = console) => {
  if (!isEnabled() || !id) return;
  try {
    const order = await db.order.findByPk(id);
    if (order && (await pushOrders([order], logger)).length) queueStockPull();
  } catch (error) {
    logger.warn(`ERP order sync failed for order ${id}: ${error.message}`);
  }
};

// Fire-and-forget after the change is committed; a failure is retried by the worker.
const queueOrderPush = (id, transaction) => {
  if (!isEnabled()) return;
  const run = () => setImmediate(() => { void pushOrderById(id); });
  if (transaction?.afterCommit) transaction.afterCommit(run);
  else run();
};

const registerErpSyncHooks = (Order) => {
  Order.addHook("afterCreate", "erpSync", (order, options) => {
    if (erpEvent(order.status)) queueOrderPush(order.Id, options.transaction);
  });
  Order.addHook("afterUpdate", "erpSync", (order, options) => {
    if (!(options.fields || []).includes("status") || !erpEvent(order.status)) return;
    queueOrderPush(order.Id, options.transaction);
  });
};

// Shop catalogue -> ERP Product list (same names, variant values as sizes).
const pushProducts = async (logger = console) => {
  if (!isEnabled()) return null;
  const products = await db.product.findAll({
    attributes: ["Id", "name"],
    where: { status: { [Op.ne]: "Inactive" } },
    include: [{ model: db.variation, as: "variations", attributes: ["options", "attribute", "colorId"] }],
  });
  const list = products.map((product) => {
    const variations = product.variations || [];
    const values = variations.length > 1
      ? [...new Set(variations.map((variation) => optionValue(getVariationOptions(variation))).filter(Boolean))]
      : [];
    return { shopId: product.Id, name: product.name, variants: values };
  });
  try {
    for (let start = 0; start < list.length; start += 100) {
      await post("/products", { products: list.slice(start, start + 100) });
    }
  } catch (error) {
    logger.warn(`ERP product sync failed: ${error.message}`);
  }
  return list.length;
};

const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const erpVariantQuantity = (entry, value) => {
  const wanted = normalizeText(value);
  const match = entry.variants.find((variant) => {
    const size = normalizeText(variant.size);
    const color = normalizeText(variant.color);
    return size === wanted || [size, color].filter(Boolean).join(" / ") === wanted || (!size && color === wanted);
  });
  return Number(match?.quantity || 0);
};

// Variant stock = ERP stock − what open orders still hold. An order stops
// holding once its Intransit reached the ERP (that stock already left the
// ERP). Variations are locked first, so an order placed meanwhile either is
// counted here or takes its stock after this write.
const pullErpStock = async (logger = console) => {
  if (!erpOwnsStock()) return null;
  const openOrders = {
    status: { [Op.notIn]: [...STOCK_RELEASE_STATUSES, ...FINAL_STATUSES] },
    stockLedger: { [Op.ne]: null },
  };
  try {
    const candidates = await db.order.findAll({ attributes: ["Id"], where: openOrders, raw: true });
    const snapshot = await post("/stock", { orderIds: candidates.map((order) => order.Id) });
    const leftErp = new Set((snapshot?.intransitOrderIds || []).map(Number));
    const byShopId = new Map();
    const byName = new Map();
    (snapshot?.products || []).forEach((entry) => {
      (entry.shopProductIds || []).forEach((id) => byShopId.set(Number(id), entry));
      byName.set(normalizeText(entry.name), entry);
    });

    return await db.sequelize.transaction(async (transaction) => {
      const variations = await db.variation.findAll({
        attributes: ["Id", "productId", "options", "attribute", "colorId", "stock"],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const [products, orders] = await Promise.all([
        db.product.findAll({ attributes: ["Id", "name"], transaction, raw: true }),
        db.order.findAll({ attributes: ["Id", "stockLedger"], where: openOrders, transaction, raw: true }),
      ]);

      const holds = new Map();
      orders.filter((order) => !leftErp.has(Number(order.Id))).forEach((order) => {
        toLedgerMap(parseObject(order.stockLedger)).forEach((qty, variationId) => {
          holds.set(variationId, (holds.get(variationId) || 0) + qty);
        });
      });
      const namesById = new Map(products.map((product) => [Number(product.Id), product.name]));
      const variantCounts = new Map();
      variations.forEach((row) => variantCounts.set(row.productId, (variantCounts.get(row.productId) || 0) + 1));

      let changed = 0;
      for (const variation of variations) {
        const productId = Number(variation.productId);
        if (!namesById.has(productId)) continue;
        const entry = byShopId.get(productId) || byName.get(normalizeText(namesById.get(productId)));
        let erpQty = 0;
        if (entry) {
          erpQty = variantCounts.get(variation.productId) > 1
            ? erpVariantQuantity(entry, optionValue(getVariationOptions(variation)))
            : Number(entry.quantity || 0);
        }
        const next = erpQty - (holds.get(Number(variation.Id)) || 0);
        if (next === Number(variation.stock || 0)) continue;
        await db.variation.update({ stock: next }, { where: { Id: variation.Id }, transaction });
        changed += 1;
      }
      return changed;
    });
  } catch (error) {
    logger.warn(`ERP stock sync failed: ${error.message}`);
    return null;
  }
};

// Stock is pulled right after a push moved ERP stock, at most one at a time.
let stockPull = null;
const queueStockPull = () => {
  if (!erpOwnsStock() || stockPull) return;
  stockPull = pullErpStock().finally(() => { stockPull = null; });
};

// Catch-up: pulls ERP stock every run, re-sends recently changed orders
// (pushes that failed, or stock that has arrived since) and refreshes the
// product list every few runs.
const createErpSyncWorker = ({
  logger = console,
  intervalMs = 120000,
  lookbackDays = 3,
  orderEvery = 5,
  productEvery = 30,
} = {}) => {
  let timer;
  let active;
  let runs = 0;
  let stopped = false;

  const sweep = async () => {
    const run = runs;
    runs += 1;
    if (run % productEvery === 0) await pushProducts(logger);
    if (run % orderEvery === 0) await sweepOrders();
    await pullErpStock(logger);
  };

  const sweepOrders = async () => {
    const since = new Date(Date.now() - lookbackDays * 86400000);
    let cursor = 0;
    while (!stopped) {
      const orders = await db.order.findAll({
        where: {
          Id: { [Op.gt]: cursor },
          status: { [Op.in]: SYNC_STATUSES },
          updatedAt: { [Op.gte]: since },
        },
        order: [["Id", "ASC"]],
        limit: 100,
      });
      if (!orders.length) break;
      cursor = orders[orders.length - 1].Id;
      await pushOrders(orders, logger);
    }
  };

  const run = () => {
    if (stopped || !isEnabled()) return Promise.resolve();
    if (active) return active;
    active = sweep().catch((error) => {
      logger.error(`ERP sync failed: ${error.message}`);
    }).finally(() => { active = null; });
    return active;
  };

  return {
    run,
    start() {
      if (timer || stopped || !isEnabled()) return;
      void run();
      timer = setInterval(run, intervalMs);
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    },
  };
};

module.exports = {
  registerErpSyncHooks,
  queueOrderPush,
  pushOrders,
  pushProducts,
  pullErpStock,
  erpOwnsStock,
  createErpSyncWorker,
};
