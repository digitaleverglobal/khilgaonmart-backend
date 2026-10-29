const db = require("../../../models");

// Orders in these statuses do not hold variant stock.
const STOCK_RELEASE_STATUSES = new Set(["incomplete", "cancelled", "returned", "return_received"]);

const parseJson = (value, fallback) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

const toLedgerMap = (entries = []) => {
  const map = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const variationId = Number(entry?.variationId ?? entry?.variantId);
    const qty = Math.floor(Number(entry?.qty) || 0);
    if (variationId > 0 && qty > 0) map.set(variationId, (map.get(variationId) || 0) + qty);
  });
  return map;
};

const desiredLedger = (order) => {
  if (STOCK_RELEASE_STATUSES.has(String(order.status || "").toLowerCase())) return new Map();
  const meta = parseJson(order.note, {});
  return toLedgerMap(meta.items);
};

// Brings variant stock in line with what the order should currently hold, and records it
// in order.stockLedger. Driven by the order's status and items, so it is safe to call
// after any create/update/delete.
const reconcileOrderStock = async (order, transaction, { released = false } = {}) => {
  const current = toLedgerMap(parseJson(order.stockLedger, []));
  const desired = released ? new Map() : desiredLedger(order);

  const ids = new Set([...current.keys(), ...desired.keys()]);
  let changed = false;
  for (const variationId of ids) {
    const delta = (desired.get(variationId) || 0) - (current.get(variationId) || 0);
    if (!delta) continue;
    changed = true;
    await db.variation.increment(
      { stock: -delta },
      { where: { Id: variationId }, transaction, paranoid: false },
    );
  }
  if (!changed) return;

  const ledger = [...desired].map(([variationId, qty]) => ({ variationId, qty }));
  await order.update({ stockLedger: ledger }, { transaction, hooks: false, silent: true });
};

const registerOrderStockHooks = (Order) => {
  Order.addHook("afterCreate", "variantStock", (order, options) =>
    reconcileOrderStock(order, options.transaction));

  Order.addHook("afterUpdate", "variantStock", (order, options) => {
    const fields = options.fields || [];
    if (!fields.includes("status") && !fields.includes("note")) return undefined;
    return reconcileOrderStock(order, options.transaction);
  });

  Order.addHook("afterDestroy", "variantStock", (order, options) =>
    reconcileOrderStock(order, options.transaction, { released: true }));
};

module.exports = { registerOrderStockHooks, reconcileOrderStock, toLedgerMap, STOCK_RELEASE_STATUSES };
