const { Op } = require("sequelize"); // Ensure Op is imported
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const {
  SupplierHistorySearchableFields,
} = require("./supplierHistory.constants");

const SupplierHistory = db.supplierHistory;
const Supplier = db.supplier;

const insertIntoDB = async (data) => {
  const result = await SupplierHistory.create(data);

  return result;
};

// const getAllFromDB = async (filters, options) => {
//   const { page, limit, skip } = paginationHelpers.calculatePagination(options);

//   const { searchTerm, startDate, endDate, ...otherFilters } = filters;

//   const andConditions = [];

//   // ✅ Search (ILIKE)
//   if (searchTerm && searchTerm.trim()) {
//     andConditions.push({
//       [Op.or]: SupplierHistorySearchableFields.map((field) => ({
//         [field]: { [Op.iLike]: `%${searchTerm.trim()}%` },
//       })),
//     });
//   }

//   // ✅ Exact filters
//   if (Object.keys(otherFilters).length) {
//     andConditions.push(
//       ...Object.entries(otherFilters).map(([key, value]) => ({
//         [key]: { [Op.eq]: value },
//       })),
//     );
//   }

//   // ✅ Date range
//   if (startDate && endDate) {
//     const start = new Date(startDate);
//     start.setHours(0, 0, 0, 0);

//     const end = new Date(endDate);
//     end.setHours(23, 59, 59, 999);

//     andConditions.push({
//       createdAt: { [Op.between]: [start, end] },
//     });
//   }

//   // ✅ Exclude soft deleted records
//   andConditions.push({
//     deletedAt: { [Op.is]: null }, // Only include records with deletedAt as null (not deleted)
//   });

//   const whereConditions = andConditions.length
//     ? { [Op.and]: andConditions }
//     : {};

//   // ✅ paginated data
//   const data = await SupplierHistory.findAll({
//     where: whereConditions,
//     offset: skip,
//     limit,
//     include: [
//       {
//         model: Supplier,
//         as: "supplier",
//         attributes: ["Id", "name"],
//       },
//       {
//         model: Book,
//         as: "book",
//         attributes: ["Id", "name"],
//       },
//     ],
//     paranoid: true,
//     order:
//       options.sortBy && options.sortOrder
//         ? [[options.sortBy, options.sortOrder.toUpperCase()]]
//         : [["createdAt", "DESC"]],
//   });

//   const [totalPaid, totalUnpaid] = await Promise.all([
//     SupplierHistory.count({ where: whereConditions }),
//     SupplierHistory.sum("amount", {
//       where: { ...whereConditions, status: "paid" },
//     }),
//     SupplierHistory.sum("amount", {
//       where: { ...whereConditions, status: "unpaid" },
//     }),
//   ]);

//   const paid = Number(totalPaid || 0);
//   const unpaid = Number(totalUnpaid || 0);
//   const netBalance = paid - unpaid;

//   return {
//     meta: {
//       totalPaid: paid,
//       totalUnpaid: unpaid,
//       netBalance,
//       page,
//       limit,
//     },
//     data,
//   };
// };

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);

  const { searchTerm, startDate, endDate, ...otherFilters } = filters;

  const andConditions = [];

  // ✅ Search
  if (searchTerm && searchTerm.trim()) {
    andConditions.push({
      [Op.or]: SupplierHistorySearchableFields.map((field) => ({
        [field]: {
          [Op.like]: `%${searchTerm.trim()}%`, // MySQL হলে like
          // Postgres হলে Op.iLike ব্যবহার করতে পারো
        },
      })),
    });
  }

  // ✅ Exact filters
  if (Object.keys(otherFilters).length) {
    andConditions.push(
      ...Object.entries(otherFilters).map(([key, value]) => ({
        [key]: { [Op.eq]: value },
      })),
    );
  }

  // ✅ Date range
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    andConditions.push({
      createdAt: {
        [Op.between]: [start, end],
      },
    });
  }

  const whereConditions = andConditions.length
    ? { [Op.and]: andConditions }
    : {};

  // helper for adding status condition safely
  const makeStatusWhere = (status) => ({
    ...(andConditions.length
      ? { [Op.and]: [...andConditions, { status }] }
      : { status }),
  });

  const include = [];
  if (Supplier) {
    include.push({
      model: Supplier,
      as: "supplier",
      attributes: ["Id", "name"],
    });
  }

  // ✅ paginated data
  const data = await SupplierHistory.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    include,
    paranoid: true,
    order:
      options.sortBy && options.sortOrder
        ? [[options.sortBy, options.sortOrder.toUpperCase()]]
        : [["createdAt", "DESC"]],
  });

  const [totalCount, totalPaid, totalUnpaid] = await Promise.all([
    SupplierHistory.count({ where: whereConditions }),
    SupplierHistory.sum("amount", {
      where: makeStatusWhere("Paid"),
    }),
    SupplierHistory.sum("amount", {
      where: makeStatusWhere("Unpaid"),
    }),
  ]);

  const paid = Number(totalPaid || 0);
  const unpaid = Number(totalUnpaid || 0);
  const netBalance = paid - unpaid;

  return {
    meta: {
      total: totalCount,
      totalPaid: paid,
      totalUnpaid: unpaid,
      netBalance,
      page,
      limit,
    },
    data,
  };
};
const getDataById = async (id) => {
  const result = await SupplierHistory.findAll({
    where: {
      supplierId: id,
    },
  });

  return result;
};

const deleteIdFromDB = async (id) => {
  const result = await SupplierHistory.destroy({
    where: {
      Id: id,
    },
  });

  return result;
};

const updateOneFromDB = async (id, payload) => {
  const result = await SupplierHistory.update(payload, {
    where: {
      Id: id,
    },
  });

  return result;
};

const getAllFromDBWithoutQuery = async () => {
  const andConditions = [];
  const makeStatusWhere = (status) => ({
    ...(andConditions.length
      ? { [Op.and]: [...andConditions, { status }] }
      : { status }),
  });
  const result = await SupplierHistory.findAll({
    paranoid: true,
    order: [["createdAt", "DESC"]],
  });

  const [totalCount, totalPaid, totalUnpaid] = await Promise.all([
    SupplierHistory.count(),
    SupplierHistory.sum("amount", {
      where: makeStatusWhere("Paid"),
    }),
    SupplierHistory.sum("amount", {
      where: makeStatusWhere("Unpaid"),
    }),
  ]);

  const paid = Number(totalPaid || 0);
  const unpaid = Number(totalUnpaid || 0);
  const netBalance = paid - unpaid;

  return {
    meta: {
      total: totalCount,
      totalPaid: paid,
      totalUnpaid: unpaid,
      netBalance,
    },
    result,
  };
};

const SupplierHistoryService = {
  getAllFromDB,
  insertIntoDB,
  deleteIdFromDB,
  updateOneFromDB,
  getDataById,
  getAllFromDBWithoutQuery,
};

module.exports = SupplierHistoryService;
