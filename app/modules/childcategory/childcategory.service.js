const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const Childcategory = db.childcategory;

const insertIntoDB = async (data) => {
  return await Childcategory.create(data);
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

  const result = await Childcategory.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    order: options.sortBy && options.sortOrder
      ? [[options.sortBy, options.sortOrder.toUpperCase()]]
      : [["createdAt", "ASC"], ["Id", "ASC"]],
  });

  const count = await Childcategory.count({ where: whereConditions });

  return { meta: { count, page, limit }, data: result };
};

const getAllFromDBWithoutQuery = async () => {
  return await Childcategory.findAll({ paranoid: true, order: [["createdAt", "ASC"], ["Id", "ASC"]] });
};

const getDataById = async (id) => {
  return await Childcategory.findOne({ where: { Id: id } });
};

const updateOneFromDB = async (id, payload) => {
  return await Childcategory.update(payload, { where: { Id: id } });
};

const deleteIdFromDB = async (id) => {
  return await Childcategory.destroy({ where: { Id: id } });
};

const ChildcategoryService = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getDataById, updateOneFromDB, deleteIdFromDB,
};

module.exports = ChildcategoryService;
