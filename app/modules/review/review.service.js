const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const RewardService = require("../reward/reward.service");
const { normalizeCustomerPhone } = require("../customer/customerSync");
const Review = db.review;

const insertIntoDB = async (data) => {
  return await Review.create(data);
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;
  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      [Op.or]: [
        { customerName: { [Op.like]: `%${searchTerm}%` } },
        { productName: { [Op.like]: `%${searchTerm}%` } },
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

  const result = await Review.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    order: options.sortBy && options.sortOrder
      ? [[options.sortBy, options.sortOrder.toUpperCase()]]
      : [["createdAt", "DESC"]],
  });

  const count = await Review.count({ where: whereConditions });

  return { meta: { count, page, limit }, data: result };
};

const getAllFromDBWithoutQuery = async () => {
  return await Review.findAll({ paranoid: true, order: [["createdAt", "DESC"]] });
};

const getPublicApprovedReviews = async (filters = {}, options = {}) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination({
    page: options.page || 1,
    limit: options.limit || 20,
  });
  const andConditions = [{ status: "approved" }];

  const productMatch = [];
  if (filters.productId) {
    productMatch.push({ productId: { [Op.eq]: filters.productId } });
  }
  if (filters.productName) {
    productMatch.push({ productName: { [Op.like]: `%${filters.productName}%` } });
  }
  if (productMatch.length) {
    andConditions.push({ [Op.or]: productMatch });
  }

  const whereConditions = { [Op.and]: andConditions };
  const data = await Review.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    paranoid: true,
    attributes: ["Id", "productId", "productName", "customerName", "rating", "comment", "createdAt"],
    order: [["createdAt", "DESC"]],
  });
  const count = await Review.count({ where: whereConditions });

  return { meta: { count, page, limit }, data };
};

const getDataById = async (id) => {
  return await Review.findOne({ where: { Id: id } });
};

const updateOneFromDB = async (id, payload) => {
  const result = await Review.update(payload, { where: { Id: id } });
  // Approving a customer's own review earns their review bonus (once per product).
  if (payload?.status === "approved") {
    const review = await Review.findOne({ where: { Id: id }, raw: true });
    await RewardService.awardReviewBonus(review).catch((error) =>
      console.error("Review bonus failed:", error.message),
    );
  }
  return result;
};

const parseOrderItems = (note) => {
  try {
    const meta = JSON.parse(note || "");
    return Array.isArray(meta?.items) ? meta.items : [];
  } catch {
    return [];
  }
};

// A logged-in customer reviews a product from one of their delivered orders.
// It waits for admin approval like any other review.
const submitCustomerReview = async (user, { productId, rating, comment } = {}) => {
  const phone = normalizeCustomerPhone(user?.Phone || user?.phone);
  const id = Number(productId);
  const stars = Math.round(Number(rating));
  if (!phone) throw new ApiError(401, "Please log in to write a review");
  if (!id) throw new ApiError(400, "Product is required");
  if (!(stars >= 1 && stars <= 5)) throw new ApiError(400, "Rating must be 1 to 5");
  const text = String(comment || "").trim();
  if (text.length < 3) throw new ApiError(400, "রিভিউ লিখুন");

  const product = await db.product.findByPk(id, { attributes: ["Id", "name"] });
  if (!product) throw new ApiError(404, "Product not found");

  const delivered = await db.order.findAll({
    attributes: ["note"],
    where: { customerPhone: { [Op.in]: [phone, `88${phone}`, `+88${phone}`] }, status: "delivered" },
    raw: true,
  });
  const bought = delivered.some((order) =>
    parseOrderItems(order.note).some((item) => Number(item.id ?? item.productId) === id));
  if (!bought) throw new ApiError(403, "শুধু ডেলিভারি পাওয়া পণ্যের রিভিউ দেওয়া যাবে");

  const existing = await Review.findOne({ where: { productId: id, customerPhone: phone } });
  if (existing) throw new ApiError(409, "এই পণ্যের রিভিউ আপনি আগেই দিয়েছেন");

  const name = [user.FirstName, user.LastName].filter(Boolean).join(" ").trim() || "Customer";
  return Review.create({
    productId: id,
    productName: product.name,
    customerName: name,
    customerPhone: phone,
    rating: stars,
    comment: text.slice(0, 2000),
    status: "pending",
  });
};

const deleteIdFromDB = async (id) => {
  return await Review.destroy({ where: { Id: id } });
};

const ReviewService = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getPublicApprovedReviews, getDataById, updateOneFromDB, deleteIdFromDB,
  submitCustomerReview,
};

module.exports = ReviewService;
