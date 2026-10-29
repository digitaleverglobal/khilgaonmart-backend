const { Op, fn, col, literal } = require("sequelize");
const db = require("../../../models");

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const STATUS_CONFIG = [
  { key: "all",        label: "All Order",          color: "#3b82f6" },
  { key: "pre_order",  label: "Pre Order",          color: "#ec4899" },
  { key: "pending",    label: "Pending Orders",     color: "#8b5cf6" },
  { key: "confirmed",  label: "Confirmed Orders",   color: "#06b6d4" },
  { key: "packaging",  label: "Packaging Orders",   color: "#a855f7" },
  { key: "on_hold",    label: "On Hold Orders",     color: "#6b7280" },
  { key: "in_courier", label: "In Courier Orders",  color: "#3b82f6" },
  { key: "delivered",  label: "Delivered Orders",   color: "#22c55e" },
  { key: "cancelled",  label: "Cancelled Orders",   color: "#ec4899" },
  { key: "returned",   label: "Returned Orders",    color: "#f59e0b" },
  { key: "incomplete", label: "Incomplete",         color: "#6366f1" },
];

const SOURCE_COLORS = [
  "#0f9f8f",
  "#3b82f6",
  "#ec4899",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#64748b",
  "#ef4444",
  "#14b8a6",
];

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const extractOrderSource = (order = {}) => {
  const directSource = String(order.orderSource || "").trim();
  if (directSource) return directSource;
  if (!order.note || typeof order.note !== "string") return "No Source";
  try {
    const meta = JSON.parse(order.note);
    return String(meta.orderSource || meta.source || meta.platform || "").trim() || "No Source";
  } catch (error) {
    return "No Source";
  }
};

const { scopeOrdersToUser: applyOrderAssignmentScope } = require("../order/orderAccess");

const buildDateWhere = (fromDate, toDate) => {
  if (fromDate && toDate) return { orderDate: { [Op.between]: [fromDate, toDate] } };
  if (fromDate) return { orderDate: { [Op.gte]: fromDate } };
  if (toDate)   return { orderDate: { [Op.lte]: toDate } };
  return {};
};

const getDashboardStats = async ({ fromDate, toDate } = {}, user = {}) => {
  const dateWhere = applyOrderAssignmentScope(buildDateWhere(fromDate, toDate), user);

  // ── 1. Order aggregation by status ─────────────────────────────────────
  const statusRows = await db.order.findAll({
    attributes: [
      "status",
      [fn("COUNT", col("Id")),         "count"],
      [fn("SUM", col("totalBill")),    "totalBill"],
    ],
    where: dateWhere,
    group: ["status"],
    raw: true,
    paranoid: true,
  });

  const statusMap = {};
  let grandCount = 0;
  let grandBill  = 0;
  statusRows.forEach((r) => {
    const count    = Number(r.count)    || 0;
    const bill     = Number(r.totalBill) || 0;
    // Return Received is shown together with Returned.
    const key = r.status === "return_received" ? "returned" : r.status;
    statusMap[key] = { count: (statusMap[key]?.count || 0) + count, bill: (statusMap[key]?.bill || 0) + bill };
    grandCount += count;
    grandBill  += bill;
  });

  const ordersByStatus = STATUS_CONFIG.map((cfg) => {
    if (cfg.key === "all") {
      return { status: "all", label: cfg.label, count: grandCount, totalBill: grandBill, percent: 100, color: cfg.color };
    }
    const { count = 0, bill = 0 } = statusMap[cfg.key] || {};
    const percent = grandCount > 0 ? Math.round((count / grandCount) * 100) : 0;
    return { status: cfg.key, label: cfg.label, count, totalBill: bill, percent, color: cfg.color };
  });

  const sourceOrderRows = await db.order.findAll({
    attributes: ["orderSource", "note", "totalBill"],
    where: dateWhere,
    raw: true,
    paranoid: true,
  });

  const sourceMap = {};
  sourceOrderRows.forEach((order) => {
    const source = extractOrderSource(order);
    if (!sourceMap[source]) sourceMap[source] = { count: 0, totalBill: 0 };
    sourceMap[source].count += 1;
    sourceMap[source].totalBill += Number(order.totalBill || 0);
  });

  const ordersBySource = Object.entries(sourceMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([source, row], index) => {
      const count = Number(row.count) || 0;
      const totalBill = Number(row.totalBill) || 0;
    return {
      source,
      label: source,
      count,
      totalBill,
      percent: grandCount > 0 ? Math.round((count / grandCount) * 100) : 0,
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    };
  });

  ordersBySource.push({
    source: "total",
    label: "Total",
    count: grandCount,
    totalBill: grandBill,
    percent: 100,
    color: "#111827",
  });

  // ── 2. Summary card numbers ─────────────────────────────────────────────
  const deliveredBill = statusMap["delivered"]?.bill || 0;
  const totalCustomers = await db.user.count({ paranoid: true });

  // ── 3. Visitor stats ────────────────────────────────────────────────────
  const totalVisitors = (await db.visitorStat.sum("visitors")) || 0;

  const summary = {
    totalSales:     grandBill,
    deliveredSales: deliveredBill,
    totalOrders:    grandCount,
    totalVisitors:  Number(totalVisitors),
    totalCustomers: totalCustomers,
  };

  // ── 4. Sales chart — last 30 days (or filtered range) ──────────────────
  const chartFrom = fromDate || daysAgo(29);
  const chartTo   = toDate   || today();

  const chartRows = await db.order.findAll({
    attributes: [
      "orderDate",
      [fn("SUM", col("totalBill")), "sales"],
    ],
    where: { orderDate: { [Op.between]: [chartFrom, chartTo] } },
    group: ["orderDate"],
    order: [["orderDate", "ASC"]],
    raw: true,
    paranoid: true,
  });

  const salesChart = chartRows.map((r) => ({
    date:  r.orderDate,
    sales: Number(r.sales) || 0,
  }));

  // ── 5. Top selling products (by total quantity in orders) ───────────────
  const topRows = await db.order.findAll({
    attributes: [
      "productName",
      "productImage",
      [fn("SUM", col("quantity")),  "qty"],
      [fn("SUM", col("totalBill")), "total"],
    ],
    where: { ...dateWhere, productName: { [Op.ne]: null } },
    group: ["productName", "productImage"],
    order: [[literal("qty"), "DESC"]],
    limit: 10,
    raw: true,
    paranoid: true,
  });

  const topProducts = topRows.map((r) => ({
    productName:  r.productName,
    productImage: r.productImage,
    qty:   Number(r.qty)   || 0,
    total: Number(r.total) || 0,
  }));

  // ── 6. Delivery stats ───────────────────────────────────────────────────
  const deliveredRow   = statusMap["delivered"]   || { count: 0, bill: 0 };
  const returnedRow    = statusMap["returned"]    || { count: 0, bill: 0 };
  const processingStatuses = ["pre_order", "pending", "packaging", "confirmed", "in_courier", "on_hold", "incomplete"];
  const processingCount = processingStatuses.reduce((s, k) => s + (statusMap[k]?.count || 0), 0);
  const processingBill  = processingStatuses.reduce((s, k) => s + (statusMap[k]?.bill  || 0), 0);

  const deliveryStats = [
    {
      label:   "Delivered",
      percent: grandCount > 0 ? parseFloat(((deliveredRow.count / grandCount) * 100).toFixed(2)) : 0,
      orders:  deliveredRow.count,
      amount:  deliveredRow.bill,
      color:   "#22c55e",
      bg:      "bg-green-50",
      border:  "border-green-200",
    },
    {
      label:   "Delivery Processing",
      percent: grandCount > 0 ? parseFloat(((processingCount / grandCount) * 100).toFixed(2)) : 0,
      orders:  processingCount,
      amount:  processingBill,
      color:   "#f59e0b",
      bg:      "bg-amber-50",
      border:  "border-amber-200",
    },
    {
      label:   "Returned",
      percent: grandCount > 0 ? parseFloat(((returnedRow.count / grandCount) * 100).toFixed(2)) : 0,
      orders:  returnedRow.count,
      amount:  returnedRow.bill,
      color:   "#ef4444",
      bg:      "bg-red-50",
      border:  "border-red-200",
    },
  ];

  return { summary, ordersByStatus, ordersBySource, salesChart, topProducts, deliveryStats };
};

module.exports = { getDashboardStats };
