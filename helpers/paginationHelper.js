// const calculatePagination = (options) => {
//     const page = Number(options.page || 1);
//     const limit = Number(options.limit || 10);
//     const skip = (page - 1) * limit;

//     const sortBy = options.sortBy || 'createdAt';
//     const sortOrder = options.sortOrder || 'desc';

//     return {
//       page,
//       limit,
//       skip,
//       sortBy,
//       sortOrder,
//     };
//   };

//    const paginationHelpers = {
//     calculatePagination,
//   };

//   module.exports = paginationHelpers

const calculatePagination = (options) => {
  const page = Math.max(Number(options.page) || 1, 1);
  const limitRaw = Number(options.limit) || 10;
  const limit = Math.min(Math.max(limitRaw, 1), 100); // max 100
  const skip = (page - 1) * limit;

  const sortBy = options.sortBy || "createdAt";
  const sortOrder =
    (options.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  return { page, limit, skip, sortBy, sortOrder };
};

const paginationHelpers = {
  calculatePagination,
};

module.exports = paginationHelpers;
