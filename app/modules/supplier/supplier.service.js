const { Op, where } = require("sequelize"); // Ensure Op is imported
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const { SupplierSearchableFields } = require("./supplier.constants");
const Supplier = db.supplier;
const SupplierHistory = db.supplierHistory;

const addBalancesToSuppliers = async (suppliers) => {
  const plainSuppliers = suppliers.map((supplier) =>
    supplier.get ? supplier.get({ plain: true }) : supplier,
  );
  const supplierIds = plainSuppliers.map((supplier) => supplier.Id);

  if (!supplierIds.length) {
    return plainSuppliers;
  }

  const balanceRows = await SupplierHistory.findAll({
    attributes: [
      "supplierId",
      [
        db.Sequelize.fn(
          "SUM",
          db.Sequelize.literal(
            "CASE WHEN status = 'Paid' THEN amount ELSE 0 END",
          ),
        ),
        "totalPaid",
      ],
      [
        db.Sequelize.fn(
          "SUM",
          db.Sequelize.literal(
            "CASE WHEN status = 'Unpaid' THEN amount ELSE 0 END",
          ),
        ),
        "totalUnpaid",
      ],
    ],
    where: {
      supplierId: { [Op.in]: supplierIds },
    },
    group: ["supplierId"],
    raw: true,
  });

  const balanceMap = balanceRows.reduce((acc, row) => {
    const totalPaid = Number(row.totalPaid || 0);
    const totalUnpaid = Number(row.totalUnpaid || 0);

    acc[row.supplierId] = {
      totalPaid,
      totalUnpaid,
      netBalance: totalPaid - totalUnpaid,
    };

    return acc;
  }, {});

  return plainSuppliers.map((supplier) => ({
    ...supplier,
    totalPaid: balanceMap[supplier.Id]?.totalPaid || 0,
    totalUnpaid: balanceMap[supplier.Id]?.totalUnpaid || 0,
    netBalance: balanceMap[supplier.Id]?.netBalance || 0,
  }));
};

const insertIntoDB = async (data) => {
  const result = await Supplier.create(data);
  return result;
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);

  const { searchTerm, ...filterData } = filters;

  const andConditions = [];

  // ✅ Search (ILIKE on searchable fields)
  // if (searchTerm && searchTerm.trim()) {
  //   andConditions.push({
  //     [Op.or]: SupplierSearchableFields.map((field) => ({
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

  // Match `title` starting from the search term
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

  // ✅ Exclude soft deleted records
  andConditions.push({
    deletedAt: { [Op.is]: null }, // Only include records with deletedAt as null (not deleted)
  });

  const whereConditions = andConditions.length
    ? { [Op.and]: andConditions }
    : {};

  const result = await Supplier.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    order:
      options.sortBy && options.sortOrder
        ? [[options.sortBy, options.sortOrder.toUpperCase()]]
        : [["createdAt", "DESC"]],
  });

  const count = await Supplier.count({ where: whereConditions });

  const data = await addBalancesToSuppliers(result);

  return {
    meta: { count, page, limit },
    data,
  };
};

const getDataById = async (id) => {
  const result = await Supplier.findOne({
    where: {
      Id: id,
    },
  });

  return result;
};

const deleteIdFromDB = async (id) => {
  const result = await Supplier.destroy({
    where: {
      Id: id,
    },
  });

  return result;
};

const updateOneFromDB = async (id, payload) => {
  const result = await Supplier.update(payload, {
    where: {
      Id: id,
    },
  });

  return result;
};

const getAllFromDBWithoutQuery = async () => {
  const result = await Supplier.findAll({
    paranoid: true,
    order: [["createdAt", "DESC"]],
  });

  return addBalancesToSuppliers(result);
};

const SupplierService = {
  getAllFromDB,
  insertIntoDB,
  deleteIdFromDB,
  updateOneFromDB,
  getDataById,
  getAllFromDBWithoutQuery,
};

module.exports = SupplierService;
