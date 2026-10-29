const db = require("../../../models");
const ApiError = require("../../../error/ApiError");

const normalizeStatus = (value) => String(value).toLowerCase() === "inactive" || value === false ? "Inactive" : "Active";
const normalizeExpense = (payload = {}) => ({
  title: String(payload.title || "").trim(),
  categoryId: payload.categoryId ? Number(payload.categoryId) : null,
  categoryName: payload.categoryName || payload.category || null,
  date: payload.date || new Date().toISOString().slice(0, 10),
  amount: Number(payload.amount || 0),
  note: payload.note || null,
  status: normalizeStatus(payload.status),
});

const listCategories = () => db.expenseCategory.findAll({ order: [["name", "ASC"]] });
const createCategory = (payload) => db.expenseCategory.create({ name: String(payload.name || "").trim(), status: normalizeStatus(payload.status) });
const updateCategory = async (id, payload) => {
  const row = await db.expenseCategory.findByPk(id); if (!row) throw new ApiError(404, "Expense category not found");
  return row.update({ name: String(payload.name || row.name).trim(), status: normalizeStatus(payload.status ?? row.status) });
};
const deleteCategory = (id) => db.expenseCategory.destroy({ where: { Id: id } });
const listExpenses = () => db.expense.findAll({ order: [["date", "DESC"], ["Id", "DESC"]] });
const createExpense = (payload) => db.expense.create(normalizeExpense(payload));
const updateExpense = async (id, payload) => {
  const row = await db.expense.findByPk(id); if (!row) throw new ApiError(404, "Expense not found");
  return row.update(normalizeExpense({ ...row.get({ plain: true }), ...payload }));
};
const deleteExpense = (id) => db.expense.destroy({ where: { Id: id } });

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, listExpenses, createExpense, updateExpense, deleteExpense };
