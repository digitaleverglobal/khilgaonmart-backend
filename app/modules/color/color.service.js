const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const Color = db.color;

const insertIntoDB = async (data) => {
  return await Color.create(data);
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;
  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      [Op.or]: [
        { name: { [Op.like]: `%${searchTerm}%` } },
        { hex: { [Op.like]: `%${searchTerm}%` } },
      ],
    });
  }

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      [Op.and]: Object.entries(filterData).map(([key, value]) => ({
        [key]: { [Op.eq]: value },
      })),
    });
  }

  const whereConditions = andConditions.length ? { [Op.and]: andConditions } : {};

  const result = await Color.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    order: options.sortBy && options.sortOrder
      ? [[options.sortBy, options.sortOrder.toUpperCase()]]
      : [["name", "ASC"]],
  });

  const count = await Color.count({ where: whereConditions });

  return { meta: { count, page, limit }, data: result };
};

const getAllFromDBWithoutQuery = async () => {
  return await Color.findAll({ paranoid: true, order: [["name", "ASC"]] });
};

const getDataById = async (id) => {
  return await Color.findOne({ where: { Id: id } });
};

const updateOneFromDB = async (id, payload) => {
  return await Color.update(payload, { where: { Id: id } });
};

const deleteIdFromDB = async (id) => {
  return await Color.destroy({ where: { Id: id } });
};

const ColorService = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = ColorService;
