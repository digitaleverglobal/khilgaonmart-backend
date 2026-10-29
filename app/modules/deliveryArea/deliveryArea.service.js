const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const M = () => db.deliveryArea;

const LIST_ORDER = [["district", "ASC"], ["sortOrder", "ASC"], ["area", "ASC"]];

const cleanText = (value, field, max) => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) throw new ApiError(400, `${field} is required`);
  return text.slice(0, max);
};

const cleanCharge = (value) => {
  const amount = Number(value);
  if (value === "" || value === null || !Number.isFinite(amount) || amount < 0) {
    throw new ApiError(400, "Delivery charge must be 0 or more");
  }
  return amount.toFixed(2);
};

const cleanStatus = (value) =>
  String(value || "").toLowerCase() === "inactive" ? "Inactive" : "Active";

// Only fields that were sent are validated, so a partial update (e.g. status) works.
const cleanPayload = (payload = {}, isCreate = false) => {
  const has = (key) => isCreate || Object.prototype.hasOwnProperty.call(payload, key);
  const data = {};
  if (has("district")) data.district = cleanText(payload.district, "District", 100);
  if (has("area")) data.area = cleanText(payload.area, "Area", 150);
  if (has("charge")) data.charge = cleanCharge(payload.charge);
  if (has("sortOrder")) data.sortOrder = Math.trunc(Number(payload.sortOrder) || 0);
  if (has("status")) data.status = cleanStatus(payload.status);
  return data;
};

const ensureUnique = async ({ district, area }, exceptId) => {
  const where = { district, area };
  if (exceptId) where.Id = { [Op.ne]: exceptId };
  if (await M().findOne({ where })) {
    throw new ApiError(400, `"${area}" already exists in ${district}`);
  }
};

const insertIntoDB = async (payload) => {
  const data = cleanPayload(payload, true);
  await ensureUnique(data);
  return M().create(data);
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm, district, status } = filters || {};
  const and = [];
  if (searchTerm && searchTerm.trim()) {
    const like = `%${searchTerm.trim()}%`;
    and.push({ [Op.or]: [{ district: { [Op.like]: like } }, { area: { [Op.like]: like } }] });
  }
  if (district) and.push({ district });
  if (status) and.push({ status: cleanStatus(status) });
  const where = and.length ? { [Op.and]: and } : {};
  const [data, count] = await Promise.all([
    M().findAll({ where, offset: skip, limit, order: LIST_ORDER }),
    M().count({ where }),
  ]);
  return { meta: { count, page, limit }, data };
};

const getActiveAreas = async () =>
  M().findAll({
    where: { status: "Active" },
    attributes: ["Id", "district", "area", "charge", "sortOrder"],
    order: LIST_ORDER,
    raw: true,
  });

const updateOneFromDB = async (id, payload) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Delivery area not found");
  const data = cleanPayload(payload);
  if (data.district !== undefined || data.area !== undefined) {
    await ensureUnique({ district: data.district ?? row.district, area: data.area ?? row.area }, row.Id);
  }
  await row.update(data);
  return row;
};

const deleteIdFromDB = async (id) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Delivery area not found");
  await row.destroy();
  return { deleted: true };
};

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getActiveAreas,
  updateOneFromDB,
  deleteIdFromDB,
};
