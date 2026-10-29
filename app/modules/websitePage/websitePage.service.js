const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const M = () => db.websitePage;

const toPageSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeRow = (row) => {
  const plain = typeof row?.toJSON === "function" ? row.toJSON() : row;
  const slug = toPageSlug(plain?.name || plain?.title);
  return { ...plain, slug };
};

const insertIntoDB = async (data) => M().create(data);

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters || {};
  const where = searchTerm
    ? { [Op.or]: [{ name: { [Op.like]: `%${searchTerm}%` } }, { title: { [Op.like]: `%${searchTerm}%` } }] }
    : {};
  const [data, count] = await Promise.all([
    M().findAll({ where, offset: skip, limit, paranoid: true, order: [["createdAt", "ASC"]] }),
    M().count({ where }),
  ]);
  return { meta: { count, page, limit }, data };
};

const getDataById = async (id) => M().findOne({ where: { Id: id } });

const getPublicFromDB = async () => {
  const rows = await M().findAll({
    where: { status: { [Op.ne]: "Inactive" } },
    paranoid: true,
    order: [["createdAt", "ASC"], ["Id", "ASC"]],
  });
  const data = rows.map(normalizeRow).filter((page) => page.slug);
  return { meta: { count: data.length, page: 1, limit: data.length }, data };
};

const getPublicBySlugFromDB = async (slug) => {
  const normalizedSlug = toPageSlug(slug);
  const rows = await M().findAll({
    where: { status: { [Op.ne]: "Inactive" } },
    paranoid: true,
    order: [["createdAt", "ASC"], ["Id", "ASC"]],
  });
  const page = rows.map(normalizeRow).find((item) => item.slug === normalizedSlug);
  if (!page) throw new ApiError(404, "Page not found");
  return page;
};

const updateOneFromDB = async (id, payload) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Page not found");
  await row.update(payload);
  return row;
};

const deleteIdFromDB = async (id) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Page not found");
  await row.destroy();
  return { deleted: true };
};

module.exports = {
  toPageSlug,
  insertIntoDB,
  getAllFromDB,
  getDataById,
  getPublicFromDB,
  getPublicBySlugFromDB,
  updateOneFromDB,
  deleteIdFromDB,
};
