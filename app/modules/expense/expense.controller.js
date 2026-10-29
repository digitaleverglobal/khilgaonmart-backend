const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const Service = require("./expense.service");
const respond = (res, message, data, statusCode = 200) => sendResponse(res, { statusCode, success: true, message, data });
module.exports = {
  listCategories: catchAsync(async (_req, res) => respond(res, "Expense categories fetched", await Service.listCategories())),
  createCategory: catchAsync(async (req, res) => respond(res, "Expense category created", await Service.createCategory(req.body), 201)),
  updateCategory: catchAsync(async (req, res) => respond(res, "Expense category updated", await Service.updateCategory(req.params.id, req.body))),
  deleteCategory: catchAsync(async (req, res) => respond(res, "Expense category deleted", await Service.deleteCategory(req.params.id))),
  listExpenses: catchAsync(async (_req, res) => respond(res, "Expenses fetched", await Service.listExpenses())),
  createExpense: catchAsync(async (req, res) => respond(res, "Expense created", await Service.createExpense(req.body), 201)),
  updateExpense: catchAsync(async (req, res) => respond(res, "Expense updated", await Service.updateExpense(req.params.id, req.body))),
  deleteExpense: catchAsync(async (req, res) => respond(res, "Expense deleted", await Service.deleteExpense(req.params.id))),
};
