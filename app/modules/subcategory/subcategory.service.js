const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const Subcategory = db.subcategory;

const insertIntoDB = async (data) => {
  return await Subcategory.create(data);
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;
  const andConditions = [];

  if (searchTerm) {
    andConditions.push({ name: { [Op.like]: `%${searchTerm}%` } });
  }

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      [Op.and]: Object.entries(filterData).map(([key, value]) => ({
        [key]: { [Op.eq]: value },
      })),
    });
  }

  const whereConditions = andConditions.length ? { [Op.and]: andConditions } : {};

  const result = await Subcategory.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    order: options.sortBy && options.sortOrder
      ? [[options.sortBy, options.sortOrder.toUpperCase()]]
      : [["createdAt", "ASC"], ["Id", "ASC"]],
  });

  const count = await Subcategory.count({ where: whereConditions });

  return { meta: { count, page, limit }, data: result };
};

const getAllFromDBWithoutQuery = async () => {
  return await Subcategory.findAll({ paranoid: true, order: [["createdAt", "ASC"], ["Id", "ASC"]] });
};

const getDataById = async (id) => {
  return await Subcategory.findOne({ where: { Id: id } });
};

const updateOneFromDB = async (id, payload) => {
  return await Subcategory.update(payload, { where: { Id: id } });
};

const deleteIdFromDB = async (id) => {
  return await Subcategory.destroy({ where: { Id: id } });
};

const SubcategoryService = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = SubcategoryService;
