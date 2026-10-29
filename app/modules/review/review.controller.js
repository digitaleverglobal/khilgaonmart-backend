const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const { ReviewFilterAbleFileds } = require("./review.constants");
const ReviewService = require("./review.service");

const insertIntoDB = catchAsync(async (req, res) => {
  const result = await ReviewService.insertIntoDB(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Review created!", data: result });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, ReviewFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await ReviewService.getAllFromDB(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Reviews fetched!", meta: result.meta, data: result.data });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await ReviewService.getAllFromDBWithoutQuery();
  sendResponse(res, { statusCode: 200, success: true, message: "Reviews fetched!", data: result });
});

const getPublicApprovedReviews = catchAsync(async (req, res) => {
  const filters = pick(req.query, ["productId", "productName"]);
  const options = pick(req.query, ["limit", "page"]);
  const result = await ReviewService.getPublicApprovedReviews(filters, options);
  sendResponse(res, { statusCode: 200, success: true, message: "Reviews fetched!", meta: result.meta, data: result.data });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await ReviewService.getDataById(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Review fetched!", data: result });
});

const submitCustomerReview = catchAsync(async (req, res) => {
  const result = await ReviewService.submitCustomerReview(req.user, req.body);
  sendResponse(res, { statusCode: 201, success: true, message: "Review submitted for approval", data: result });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const result = await ReviewService.updateOneFromDB(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: "Review updated!", data: result });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await ReviewService.deleteIdFromDB(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Review deleted!", data: result });
});

const ReviewController = {
  insertIntoDB, getAllFromDB, getAllFromDBWithoutQuery, getPublicApprovedReviews, getDataById, updateOneFromDB, deleteIdFromDB,
  submitCustomerReview,
};

module.exports = ReviewController;
