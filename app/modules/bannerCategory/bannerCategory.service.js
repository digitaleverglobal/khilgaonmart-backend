const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const ApiError = require("../../../error/ApiError");
const db = require("../../../models");

const M = () => db.bannerCategory;

const normalizePayload = (payload = {}, current = {}) => ({
  name: payload.name,
  status: payload.status === false || payload.status === "Inactive" ? "Inactive" : "Active",
  sortOrder: payload.sortOrder || payload.sortOrder === 0 ? Number(payload.sortOrder) : current.sortOrder ?? null,
});

const insertIntoDB = async (payload) => M().create(normalizePayload(payload));

const getAllFromDB = async (filters = {}, options = {}) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters;
  const where = searchTerm ? { name: { [Op.like]: `%${searchTerm}%` } } : {};
  const order = options.sortBy && options.sortOrder
    ? [[options.sortBy, options.sortOrder.toUpperCase()]]
    : [["sortOrder", "ASC"], ["createdAt", "DESC"]];

  const [data, count] = await Promise.all([
    M().findAll({ where, offset: skip, limit, paranoid: true, order }),
    M().count({ where }),
  ]);

  return { meta: { count, page, limit }, data };
};

const getAllFromDBWithoutQuery = async () =>
  M().findAll({ paranoid: true, order: [["sortOrder", "ASC"], ["createdAt", "DESC"]] });

const getDataById = async (id) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Banner category not found");
  return row;
};

const updateOneFromDB = async (id, payload) => {
  const row = await getDataById(id);
  await row.update(normalizePayload(payload, row.toJSON()));
  return row;
};

const deleteIdFromDB = async (id) => {
  const row = await getDataById(id);
  await row.destroy();
  return { deleted: true };
};

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getAllFromDBWithoutQuery,
  getDataById,
  updateOneFromDB,
  deleteIdFromDB,
};
