// Admin panel: the customer list (one customer per phone number).
const { Op, fn, col } = require("sequelize");
const ApiError = require("../../../error/ApiError");
const db = require("../../../models");
const { normalizeCustomerPhone } = require("./customerSync");
const RewardService = require("../reward/reward.service");

const Customer = db.customer;
const CUSTOMER_STATUSES = ["Active", "Blocked"];

const customerCode = (id) => `C-${String(id).padStart(4, "0")}`;

// Orders store the phone as typed, so match the common spellings of a number.
const phoneSpellings = (phone) => [phone, `88${phone}`, `+88${phone}`];

const getOrderStats = async (phones) => {
  const stats = new Map();
  if (!phones.length) return stats;
  const rows = await db.order.findAll({
    attributes: [
      "customerPhone",
      [fn("COUNT", col("Id")), "orderCount"],
      [fn("SUM", col("totalBill")), "totalSpent"],
    ],
    where: {
      customerPhone: { [Op.in]: phones.flatMap(phoneSpellings) },
      status: { [Op.ne]: "incomplete" },
    },
    group: ["customerPhone"],
    raw: true,
  });
  rows.forEach((row) => {
    const phone = normalizeCustomerPhone(row.customerPhone);
    const current = stats.get(phone) || { orderCount: 0, totalSpent: 0 };
    stats.set(phone, {
      orderCount: current.orderCount + Number(row.orderCount || 0),
      totalSpent: current.totalSpent + Number(row.totalSpent || 0),
    });
  });
  return stats;
};

// Also carries the order-style field names the customer view page reads.
const toAdminCustomer = (row, stats = {}, rewardPoints = 0) => {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    ...plain,
    customerCode: customerCode(plain.Id),
    orderCount: stats.orderCount || 0,
    totalSpent: stats.totalSpent || 0,
    rewardPoints,
    customerName: plain.name || "",
    customerPhone: plain.phone,
    customerArea: plain.address || "",
    customerAddress: plain.address || "",
    customerDistrict: plain.district || "",
  };
};

const listCustomers = async ({ search, status, page = 1, limit = 20 } = {}) => {
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const where = {};
  const term = String(search || "").trim();
  if (term) {
    // "C-0007" or "c7" finds that customer by ID.
    const codeMatch = term.match(/^c-?0*(\d+)$/i);
    where[Op.or] = [
      { name: { [Op.like]: `%${term}%` } },
      { phone: { [Op.like]: `%${normalizeCustomerPhone(term) || term}%` } },
      { address: { [Op.like]: `%${term}%` } },
      ...(codeMatch ? [{ Id: Number(codeMatch[1]) }] : []),
    ];
  }
  if (CUSTOMER_STATUSES.includes(status)) where.status = status;

  const { count, rows } = await Customer.findAndCountAll({
    where,
    order: [["Id", "DESC"]],
    limit: pageSize,
    offset: (pageNumber - 1) * pageSize,
  });
  const phones = rows.map((row) => row.phone);
  const [stats, points] = await Promise.all([getOrderStats(phones), RewardService.getBalances(phones)]);

  return {
    meta: { page: pageNumber, limit: pageSize, count, totalPage: Math.max(1, Math.ceil(count / pageSize)) },
    data: rows.map((row) => toAdminCustomer(row, stats.get(row.phone), points.get(row.phone) || 0)),
  };
};

const findCustomer = async (id) => {
  const row = await Customer.findByPk(id);
  if (!row) throw new ApiError(404, "Customer not found");
  return row;
};

const getCustomer = async (id) => {
  const row = await findCustomer(id);
  const [stats, points] = await Promise.all([getOrderStats([row.phone]), RewardService.getBalances([row.phone])]);
  return toAdminCustomer(row, stats.get(row.phone), points.get(row.phone) || 0);
};

// The phone is the customer's identity (it links their orders), so it isn't editable.
const updateCustomer = async (id, payload = {}) => {
  const row = await findCustomer(id);
  const updates = {};
  if (payload.name !== undefined) updates.name = String(payload.name).trim().slice(0, 255) || null;
  if (payload.address !== undefined) updates.address = String(payload.address).trim() || null;
  if (payload.district !== undefined) updates.district = String(payload.district).trim().slice(0, 100) || null;
  if (payload.note !== undefined) updates.note = String(payload.note).trim() || null;
  if (payload.status !== undefined) {
    if (!CUSTOMER_STATUSES.includes(payload.status)) throw new ApiError(400, "Invalid customer status");
    updates.status = payload.status;
  }
  await row.update(updates);
  return getCustomer(row.Id);
};

// Removes the customer record only; their orders stay.
const deleteCustomer = async (id) => {
  const row = await findCustomer(id);
  await row.destroy();
  return { deleted: true };
};

module.exports = { listCustomers, getCustomer, updateCustomer, deleteCustomer };
