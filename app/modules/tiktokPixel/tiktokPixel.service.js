const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const M = () => db.tiktokPixel;

const normalizePayload = (data = {}) => {
  const pixelCode = String(data.pixelCode || "").trim();
  const accessToken = String(data.accessToken || "").trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(pixelCode)) throw new ApiError(400, "A valid TikTok Pixel Code is required");
  if (!accessToken) throw new ApiError(400, "TikTok access token is required");
  return {
    pixelCode,
    accessToken,
    testEventCode: String(data.testEventCode || "").trim() || null,
    status: data.status === false || data.status === "Inactive" ? "Inactive" : "Active",
  };
};

const ensureUnique = async (pixelCode, excludeId) => {
  const where = { pixelCode };
  if (excludeId) where.Id = { [Op.ne]: excludeId };
  if (await M().findOne({ where })) throw new ApiError(409, "This TikTok Pixel Code already exists");
};

const insertIntoDB = async (data) => {
  const payload = normalizePayload(data);
  await ensureUnique(payload.pixelCode);
  return M().create(payload);
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters || {};
  const where = searchTerm ? { pixelCode: { [Op.like]: `%${searchTerm}%` } } : {};
  const [data, count] = await Promise.all([
    M().findAll({ where, offset: skip, limit, paranoid: true, order: [["createdAt", "DESC"]] }),
    M().count({ where }),
  ]);
  return { meta: { count, page, limit }, data };
};

const getActiveFromDB = async () =>
  M().findAll({ where: { status: "Active" }, paranoid: true, order: [["createdAt", "DESC"]] });

const getPublicFromDB = async () => {
  const rows = await getActiveFromDB();
  return rows.map((row) => {
    const plain = row.toJSON();
    return { Id: plain.Id, pixelCode: plain.pixelCode, status: plain.status };
  });
};

const updateOneFromDB = async (id, payload) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "TikTok pixel not found");
  const data = normalizePayload({ ...row.get({ plain: true }), ...payload });
  await ensureUnique(data.pixelCode, row.Id);
  await row.update(data);
  return row;
};

const deleteIdFromDB = async (id) => {
  const row = await M().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "TikTok pixel not found");
  await row.destroy();
  return { deleted: true };
};

module.exports = { insertIntoDB, getAllFromDB, getActiveFromDB, getPublicFromDB, updateOneFromDB, deleteIdFromDB };
