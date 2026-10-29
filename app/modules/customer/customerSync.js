// Keeps the Customers table (one row per phone) in step with orders.
const { Op, fn, col } = require("sequelize");

const SYNCED_ORDER_FIELDS = ["customerPhone", "customerName", "customerArea", "customerDistrict", "status"];

// "+8801712345678", "8801712345678" and "01712345678" are the same customer.
const normalizeCustomerPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^8801\d{9}$/.test(digits)) return digits.slice(2);
  return digits.slice(0, 20);
};

// Incomplete checkouts are abandoned carts, not customers yet.
const isCustomerOrder = (order) =>
  order && order.status !== "incomplete" && normalizeCustomerPhone(order.customerPhone).length >= 6;

const customerValuesFromOrder = (order) => ({
  name: String(order.customerName || "").trim() || null,
  address: String(order.customerArea || "").trim() || null,
  district: String(order.customerDistrict || "").trim() || null,
  lastOrderAt: order.createdAt || new Date(),
});

// Creates the customer for this order's phone, or refreshes it with the latest
// name and address.
const upsertCustomerFromOrder = async (db, order) => {
  if (!isCustomerOrder(order)) return null;
  const phone = normalizeCustomerPhone(order.customerPhone);
  const values = customerValuesFromOrder(order);
  const existing = await db.customer.findOne({ where: { phone } });
  if (existing) return existing.update(values);
  try {
    return await db.customer.create({ phone, ...values });
  } catch (error) {
    // Another order for the same phone created it at the same moment.
    if (error.name !== "SequelizeUniqueConstraintError") throw error;
    const row = await db.customer.findOne({ where: { phone } });
    return row ? row.update(values) : null;
  }
};

const syncAfterSave = (db, order, options = {}) => {
  const run = () =>
    upsertCustomerFromOrder(db, order).catch((error) =>
      console.error("Customer sync failed:", error.message),
    );
  // Wait for the order to be committed; never fail the order because of this.
  if (options.transaction) options.transaction.afterCommit(run);
  else run();
};

const registerCustomerSyncHooks = (db, Order) => {
  Order.addHook("afterCreate", "customerSync", (order, options) => syncAfterSave(db, order, options));
  Order.addHook("afterUpdate", "customerSync", (order, options) => {
    if (SYNCED_ORDER_FIELDS.some((field) => order.changed(field))) syncAfterSave(db, order, options);
  });
};

// Adds a customer for every phone in past orders that doesn't have one yet,
// numbered in the order those customers first ordered.
const backfillCustomers = async (db) => {
  const Order = db.order;
  const groups = await Order.findAll({
    attributes: [
      "customerPhone",
      [fn("MIN", col("Id")), "firstId"],
      [fn("MAX", col("Id")), "lastId"],
    ],
    where: { status: { [Op.ne]: "incomplete" } },
    group: ["customerPhone"],
    raw: true,
  });

  const byPhone = new Map();
  for (const group of groups) {
    const phone = normalizeCustomerPhone(group.customerPhone);
    if (phone.length < 6) continue;
    const current = byPhone.get(phone);
    byPhone.set(phone, {
      firstId: Math.min(Number(group.firstId), current?.firstId ?? Infinity),
      lastId: Math.max(Number(group.lastId), current?.lastId ?? 0),
    });
  }
  if (!byPhone.size) return 0;

  const existing = new Set(
    (await db.customer.findAll({ attributes: ["phone"], raw: true })).map((row) => row.phone),
  );
  const missing = [...byPhone.entries()]
    .filter(([phone]) => !existing.has(phone))
    .sort((a, b) => a[1].firstId - b[1].firstId);
  if (!missing.length) return 0;

  const latestOrders = new Map();
  const lastIds = missing.map(([, ids]) => ids.lastId);
  for (let i = 0; i < lastIds.length; i += 500) {
    const rows = await Order.findAll({
      attributes: ["Id", "customerName", "customerArea", "customerDistrict", "createdAt"],
      where: { Id: lastIds.slice(i, i + 500) },
      raw: true,
    });
    rows.forEach((row) => latestOrders.set(Number(row.Id), row));
  }

  const rows = missing.map(([phone, ids]) => ({
    phone,
    ...customerValuesFromOrder(latestOrders.get(ids.lastId) || {}),
  }));
  await db.customer.bulkCreate(rows, { ignoreDuplicates: true });
  return rows.length;
};

module.exports = {
  normalizeCustomerPhone,
  upsertCustomerFromOrder,
  registerCustomerSyncHooks,
  backfillCustomers,
};
