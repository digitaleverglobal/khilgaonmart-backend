// Keeps the last status changes in the order note (meta.statusHistory) so reports can show
// what status an order came from.
const MAX_HISTORY = 20;

const parseMeta = (note) => {
  if (!note || typeof note !== "string") return { meta: {}, legacy: "" };
  try {
    const meta = JSON.parse(note);
    if (meta && typeof meta === "object" && !Array.isArray(meta)) return { meta, legacy: "" };
  } catch {
    // plain text note from older orders
  }
  return { meta: {}, legacy: note };
};

const appendStatusHistory = (note, from, to) => {
  if (!to || from === to) return note;
  const { meta, legacy } = parseMeta(note);
  const history = Array.isArray(meta.statusHistory) ? meta.statusHistory : [];
  return JSON.stringify({
    ...(legacy ? { legacyNote: legacy } : {}),
    ...meta,
    statusHistory: [...history, { from: from || null, to, at: new Date().toISOString() }].slice(-MAX_HISTORY),
  });
};

const registerOrderStatusHistoryHook = (Order) => {
  Order.addHook("beforeUpdate", "statusHistory", (order) => {
    if (!order.changed("status")) return;
    order.note = appendStatusHistory(order.note, order.previous("status"), order.status);
  });
};

module.exports = { appendStatusHistory, registerOrderStatusHistoryHook };
