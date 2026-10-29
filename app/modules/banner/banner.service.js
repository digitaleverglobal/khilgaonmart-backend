const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const ApiError = require("../../../error/ApiError");
const db = require("../../../models");

const M = () => db.banner;

const categoryType = (name = "") => {
  const value = String(name).toLowerCase();
  if (value.includes("main slider") || value === "slider") return "slider";
  if (value.includes("slider right") || value.includes("side banner") || value === "side") return "side";
  if (value.includes("popup")) return "popup";
  return "custom";
};

const toPublicItem = (row) => {
  const plain = row.toJSON ? row.toJSON() : row;
  const category = plain.category?.name || plain.categoryName || "";
  return {
    Id: plain.Id,
    file: plain.file,
    type: categoryType(category),
    category,
    linkUrl: plain.linkUrl || null,
    alt: plain.alt || category || "Banner",
    sortOrder: plain.sortOrder ?? plain.Id,
  };
};

const normalizePayload = async (payload = {}, file) => {
  let category = null;
  if (payload.categoryId) {
    category = await db.bannerCategory.findOne({ where: { Id: payload.categoryId } });
  }

  return {
    linkUrl: payload.linkUrl || payload.link || null,
    categoryId: category?.Id || (payload.categoryId ? Number(payload.categoryId) : null),
    categoryName: category?.name || payload.categoryName || payload.category || null,
    file: file?.filename || payload.file || payload.imageName || null,
    alt: payload.alt || payload.imageText || payload.categoryName || payload.category || null,
    status: payload.status === false || payload.status === "Inactive" ? "Inactive" : "Active",
    sortOrder: payload.sortOrder || payload.sortOrder === 0 ? Number(payload.sortOrder) : 0,
  };
};

const insertIntoDB = async (payload, file) => {
  const data = await normalizePayload(payload, file);
  if (!data.file) throw new ApiError(400, "Banner image is required");
  return M().create(data);
};

const getAllFromDB = async (filters = {}, options = {}) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters;
  const where = searchTerm
    ? { [Op.or]: [{ categoryName: { [Op.like]: `%${searchTerm}%` } }, { alt: { [Op.like]: `%${searchTerm}%` } }] }
    : {};
  const order = options.sortBy && options.sortOrder
    ? [[options.sortBy, options.sortOrder.toUpperCase()]]
    : [["sortOrder", "ASC"], ["createdAt", "DESC"]];

  const include = [{ model: db.bannerCategory, as: "category", attributes: ["Id", "name", "status"], required: false }];
  const [data, count] = await Promise.all([
    M().findAll({ where, include, offset: skip, limit, paranoid: true, order }),
    M().count({ where }),
  ]);

  return { meta: { count, page, limit }, data };
};

const getPublicFromDB = async () => {
  const rows = await M().findAll({
    where: { status: "Active" },
    include: [{ model: db.bannerCategory, as: "category", attributes: ["Id", "name", "status"], required: false }],
    paranoid: true,
    order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
  });

  return rows
    .filter((row) => !row.category || row.category.status !== "Inactive")
    .map(toPublicItem);
};

const getDataById = async (id) => {
  const row = await M().findOne({
    where: { Id: id },
    include: [{ model: db.bannerCategory, as: "category", attributes: ["Id", "name", "status"], required: false }],
  });
  if (!row) throw new ApiError(404, "Banner not found");
  return row;
};

const updateOneFromDB = async (id, payload, file) => {
  const row = await getDataById(id);
  const data = await normalizePayload({ ...row.toJSON(), ...payload }, file);
  await row.update(data);
  return getDataById(id);
};

const deleteIdFromDB = async (id) => {
  const row = await getDataById(id);
  await row.destroy();
  return { deleted: true };
};

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getPublicFromDB,
  getDataById,
  updateOneFromDB,
  deleteIdFromDB,
};
