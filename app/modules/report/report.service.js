const { Op } = require("sequelize");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");

const TYPES = ["stock_report", "stock_alert_report", "purchase_report", "order_reports", "sales_reports", "expense_reports", "loss_profit"];
const number = (value) => Number(value || 0);
const dateWhere = (field, fromDate, toDate) => {
  if (fromDate && toDate) return { [field]: { [Op.between]: [fromDate, toDate] } };
  if (fromDate) return { [field]: { [Op.gte]: fromDate } };
  if (toDate) return { [field]: { [Op.lte]: toDate } };
  return {};
};
const paginate = (rows, page, limit) => {
  const count = rows.length;
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  return { rows: rows.slice((safePage - 1) * safeLimit, safePage * safeLimit), meta: { page: safePage, limit: safeLimit, count, totalPages: Math.max(1, Math.ceil(count / safeLimit)) } };
};
const contains = (value, search) => !search || String(value || "").toLowerCase().includes(String(search).toLowerCase());

const stockReport = async (query, alertOnly = false) => {
  const [products, categories] = await Promise.all([
    db.product.findAll({ where: dateWhere("date", query.fromDate, query.toDate), include: [{ model: db.variation, as: "variations", required: false }], order: [["name", "ASC"]] }),
    db.category.findAll({ attributes: ["Id", "name"] }),
  ]);
  const categoryMap = new Map(categories.map((c) => [Number(c.Id), c.name]));
  let rows = products.map((product) => {
    const variations = product.variations || [];
    const stock = variations.reduce((sum, item) => sum + number(item.stock), 0);
    const purchaseValue = variations.reduce((sum, item) => sum + number(item.stock) * number(item.purchasePrice), 0);
    const saleValue = variations.reduce((sum, item) => sum + number(item.stock) * number(item.newPrice || item.oldPrice), 0);
    const purchasePrice = stock ? purchaseValue / stock : number(variations[0]?.purchasePrice);
    const salePrice = stock ? saleValue / stock : number(variations[0]?.newPrice || variations[0]?.oldPrice);
    return { id: product.Id, product: product.name, categoryId: product.categoryId, category: categoryMap.get(Number(product.categoryId)) || "Uncategorized", purchasePrice, salePrice, stock, alertQty: number(product.stockAlert), purchaseValue, saleValue };
  });
  if (query.categoryId) rows = rows.filter((r) => Number(r.categoryId) === Number(query.categoryId));
  if (query.productId) rows = rows.filter((r) => Number(r.id) === Number(query.productId));
  if (query.search) rows = rows.filter((r) => contains(`${r.product} ${r.category}`, query.search));
  if (alertOnly) rows = rows.filter((r) => r.stock <= r.alertQty);
  const summary = { totalStockQty: rows.reduce((s, r) => s + r.stock, 0), totalPurchaseValue: rows.reduce((s, r) => s + r.purchaseValue, 0), totalSaleValue: rows.reduce((s, r) => s + r.saleValue, 0) };
  return { ...paginate(rows, query.page, query.limit), summary };
};

const purchaseReport = async (query) => {
  const where = { ...dateWhere("date", query.fromDate, query.toDate) };
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  let data = await db.purchaseRequisition.findAll({ where, include: [{ model: db.supplier, as: "supplier", required: false }], order: [["date", "DESC"], ["Id", "DESC"]] });
  let rows = data.map((r) => ({ id: r.Id, date: r.date, invoice: `PR-${String(r.Id).padStart(6, "0")}`, supplier: r.supplier?.name || "N/A", supplierId: r.supplierId, qty: number(r.quantity), amount: number(r.amount), status: r.status || "N/A" }));
  if (query.search) rows = rows.filter((r) => contains(`${r.invoice} ${r.supplier}`, query.search));
  const summary = { totalQty: rows.reduce((s, r) => s + r.qty, 0), totalAmount: rows.reduce((s, r) => s + r.amount, 0) };
  return { ...paginate(rows, query.page, query.limit), summary };
};

const orderReport = async (query, salesOnly = false) => {
  const where = { ...dateWhere("orderDate", query.fromDate, query.toDate) };
  if (salesOnly) where.status = "delivered"; else if (query.status && query.status !== "all") where.status = query.status;
  let data = await db.order.findAll({ where, order: [["orderDate", "DESC"], ["Id", "DESC"]] });
  let rows = data.map((r) => ({ id: r.Id, date: r.orderDate, invoice: r.orderId, customer: r.customerName, phone: r.customerPhone, qty: number(r.quantity), amount: number(r.totalBill), status: r.status }));
  if (query.search) rows = rows.filter((r) => contains(`${r.invoice} ${r.customer} ${r.phone}`, query.search));
  const summary = { totalQty: rows.reduce((s, r) => s + r.qty, 0), totalAmount: rows.reduce((s, r) => s + r.amount, 0) };
  return { ...paginate(rows, query.page, query.limit), summary };
};

const expenseReport = async (query) => {
  const where = { ...dateWhere("date", query.fromDate, query.toDate) };
  if (query.categoryId || query.expenseCategoryId) where.categoryId = Number(query.categoryId || query.expenseCategoryId);
  let data = await db.expense.findAll({ where, order: [["date", "DESC"], ["Id", "DESC"]] });
  let rows = data.map((r) => ({ id: r.Id, date: r.date, name: r.title, category: r.categoryName || "Uncategorized", categoryId: r.categoryId, amount: number(r.amount), note: r.note || "" }));
  if (query.search) rows = rows.filter((r) => contains(`${r.name} ${r.category} ${r.note}`, query.search));
  const summary = { totalAmount: rows.reduce((s, r) => s + r.amount, 0) };
  return { ...paginate(rows, query.page, query.limit), summary };
};

const lossProfit = async (query) => {
  const [sales, purchases, expenses] = await Promise.all([
    db.order.sum("totalBill", { where: { status: "delivered", ...dateWhere("orderDate", query.fromDate, query.toDate) } }),
    db.purchaseRequisition.sum("amount", { where: dateWhere("date", query.fromDate, query.toDate) }),
    db.expense.sum("amount", { where: dateWhere("date", query.fromDate, query.toDate) }),
  ]);
  const totalSales = number(sales); const totalPurchaseCost = number(purchases); const totalExpense = number(expenses);
  const rows = [{ name: "Total Sales", amount: totalSales }, { name: "Total Purchase Cost", amount: totalPurchaseCost }, { name: "Total Expense", amount: totalExpense }, { name: "Net Profit", amount: totalSales - totalPurchaseCost - totalExpense }];
  return { rows, meta: { page: 1, limit: 4, count: 4, totalPages: 1 }, summary: { totalSales, totalPurchaseCost, totalExpense, netProfit: totalSales - totalPurchaseCost - totalExpense } };
};

const getReport = async (type, query = {}) => {
  if (!TYPES.includes(type)) throw new ApiError(404, "Report not found");
  if (type === "stock_report") return stockReport(query);
  if (type === "stock_alert_report") return stockReport(query, true);
  if (type === "purchase_report") return purchaseReport(query);
  if (type === "order_reports") return orderReport(query);
  if (type === "sales_reports") return orderReport(query, true);
  if (type === "expense_reports") return expenseReport(query);
  return lossProfit(query);
};

const getOptions = async () => {
  const [categories, products, suppliers, expenseCategories] = await Promise.all([
    db.category.findAll({ attributes: ["Id", "name"], order: [["name", "ASC"]] }),
    db.product.findAll({ attributes: ["Id", "name", "categoryId"], order: [["name", "ASC"]] }),
    db.supplier.findAll({ attributes: ["Id", "name"], order: [["name", "ASC"]] }),
    db.expenseCategory.findAll({ attributes: ["Id", "name"], order: [["name", "ASC"]] }),
  ]);
  return { categories, products, suppliers, expenseCategories, orderStatuses: ["pre_order", "pending", "confirmed", "packaging", "on_hold", "in_courier", "delivered", "cancelled", "returned", "incomplete"] };
};

module.exports = { getReport, getOptions };
