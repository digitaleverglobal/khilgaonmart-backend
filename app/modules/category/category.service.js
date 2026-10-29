const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const { isInlineImage } = require("../../../helpers/inlineImages");
const { CategorySearchableFields } = require("./category.constants");
const Category = db.category;

const insertIntoDB = async (data) => {
  const result = await Category.create(data);
  return result;
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);

  const { searchTerm, ...filterData } = filters;

  const andConditions = [];

  // ✅ Search (ILIKE on searchable fields)
  // if (searchTerm && searchTerm.trim()) {
  //   andConditions.push({
  //     [Op.or]: CategorySearchableFields.map((field) => ({
  //       [field]: { [Op.iLike]: `%${searchTerm.trim()}%` },
  //     })),
  //   });
  // }

  // // ✅ Exact filters (e.g. name)
  // if (Object.keys(otherFilters).length) {
  //   andConditions.push(
  //     ...Object.entries(otherFilters).map(([key, value]) => ({
  //       [key]: { [Op.eq]: value },
  //     }))
  //   );
  // }

  // Match category name starting from the search term.
  if (searchTerm) {
    andConditions.push({
      name: { [Op.like]: `${searchTerm}%` },
    });
  }

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      [Op.and]: Object.entries(filterData).map(([key, value]) => ({
        [key]: { [Op.eq]: value },
      })),
    });
  }

  const whereConditions = andConditions.length
    ? { [Op.and]: andConditions }
    : {};

  const result = await Category.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    order:
      options.sortBy && options.sortOrder
        ? [[options.sortBy, options.sortOrder.toUpperCase()]]
        : [
            ["createdAt", "ASC"],
            ["Id", "ASC"],
          ],
  });

  const count = await Category.count({ where: whereConditions });

  return {
    meta: { count, page, limit },
    data: result,
  };
};

const getDataById = async (id) => {
  const result = await Category.findOne({
    where: {
      Id: id,
    },
  });

  return result;
};

const deleteIdFromDB = async (id) => {
  const result = await Category.destroy({
    where: {
      Id: id,
    },
  });

  return result;
};

const updateOneFromDB = async (id, payload) => {
  const result = await Category.update(payload, {
    where: {
      Id: id,
    },
  });

  return result;
};

const getAllFromDBWithoutQuery = async () => {
  const result = await Category.findAll({
    paranoid: true,
    order: [
      ["createdAt", "ASC"],
      ["Id", "ASC"],
    ],
  });

  return result;
};

const getPublicMenu = async () => {
  const [categories, subcategories, childcategories] = await Promise.all([
    Category.findAll({
      attributes: ["Id", "name", "sortOrder", "isActive", "frontView", "imageFile", "image"],
      where: {
        status: { [Op.ne]: "Inactive" },
      },
      paranoid: true,
      order: [
        ["createdAt", "ASC"],
        ["Id", "ASC"],
      ],
      raw: true,
    }),
    db.subcategory.findAll({
      where: { status: { [Op.ne]: "Inactive" } },
      paranoid: true,
      order: [
        ["createdAt", "ASC"],
        ["Id", "ASC"],
      ],
      raw: true,
    }),
    db.childcategory.findAll({
      where: { status: { [Op.ne]: "Inactive" } },
      paranoid: true,
      order: [
        ["createdAt", "ASC"],
        ["Id", "ASC"],
      ],
      raw: true,
    }),
  ]);

  const childcategoriesBySubcategory = childcategories.reduce(
    (acc, childcategory) => {
      const key = String(childcategory.subcategoryId || "");
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        Id: childcategory.Id,
        label: childcategory.name,
        name: childcategory.name,
      });
      return acc;
    },
    {},
  );

  const subcategoriesByCategory = subcategories.reduce((acc, subcategory) => {
    const key = String(subcategory.categoryId || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      Id: subcategory.Id,
      label: subcategory.name,
      name: subcategory.name,
      childItems: childcategoriesBySubcategory[String(subcategory.Id)] || [],
    });
    return acc;
  }, {});

  return categories.map((category, index) => ({
    Id: category.Id,
    label: category.name,
    subItems: subcategoriesByCategory[String(category.Id)] || [],
    sortOrder: category.sortOrder ?? index,
    isActive: category.isActive !== false && category.frontView !== false,
    // Rows not yet migrated may still hold multi-MB base64 strings; never
    // ship those in the public menu.
    imageFile: [category.imageFile, category.image].find((file) => file && !isInlineImage(file)) || null,
  }));
};

const CategoryService = {
  getAllFromDB,
  insertIntoDB,
  deleteIdFromDB,
  updateOneFromDB,
  getDataById,
  getAllFromDBWithoutQuery,
  getPublicMenu,
};

module.exports = CategoryService;
