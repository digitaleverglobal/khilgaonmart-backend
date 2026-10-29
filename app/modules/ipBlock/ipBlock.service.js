const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const IpBlock = () => db.ipBlock;

const insertIntoDB = async (data) => IpBlock().create(data);

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters || {};
  const andConditions = [];
  if (searchTerm) {
    andConditions.push({
      [Op.or]: [
        { ip:     { [Op.like]: `%${searchTerm}%` } },
        { reason: { [Op.like]: `%${searchTerm}%` } },
      ],
    });
  }
  const where = andConditions.length ? { [Op.and]: andConditions } : {};
  const [data, count] = await Promise.all([
    IpBlock().findAll({ where, offset: skip, limit, paranoid: true, order: [["createdAt", "DESC"]] }),
    IpBlock().count({ where }),
  ]);
  return { meta: { count, page, limit }, data };
};

const updateOneFromDB = async (id, payload) => {
  const row = await IpBlock().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "IP block not found");
  await row.update(payload);
  return row;
};

const deleteIdFromDB = async (id) => {
  const row = await IpBlock().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "IP block not found");
  await row.destroy();
  return { deleted: true };
};

module.exports = { insertIntoDB, getAllFromDB, updateOneFromDB, deleteIdFromDB };
