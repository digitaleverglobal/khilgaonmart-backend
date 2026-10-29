const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const PurchaseRequisitionService = require("./purchaseRequisition.service");
const {
  PurchaseRequisitionFilterAbleFileds,
} = require("./purchaseRequisition.constants");

const insertIntoDB = catchAsync(async (req, res) => {
  const file = req.file ? req.file.path.replace(/\\/g, "/") : undefined;

  const data = {
    ...req.body,
    file,
  };

  const result = await PurchaseRequisitionService.insertIntoDB(data);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "PurchaseRequisition data created!!",
    data: result,
  });
});

const getAllFromDB = catchAsync(async (req, res) => {
  const filters = pick(req.query, PurchaseRequisitionFilterAbleFileds);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

  const result = await PurchaseRequisitionService.getAllFromDB(
    filters,
    options,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Purchase requisition data fetched!!",
    meta: result.meta,
    data: result.data,
  });
});

const getDataById = catchAsync(async (req, res) => {
  const result = await PurchaseRequisitionService.getDataById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "PurchaseRequisition data fetched!!",
    data: result,
  });
});

const updateOneFromDB = catchAsync(async (req, res) => {
  const { id } = req.params;
  const file = req.file ? req.file.path.replace(/\\/g, "/") : undefined;
  const data = {
    ...req.body,
    file,
  };

  const result = await PurchaseRequisitionService.updateOneFromDB(id, data);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "PurchaseRequisition update successfully!!",
    data: result,
  });
});

const deleteIdFromDB = catchAsync(async (req, res) => {
  const result = await PurchaseRequisitionService.deleteIdFromDB(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "PurchaseRequisition delete successfully!!",
    data: result,
  });
});

const getAllFromDBWithoutQuery = catchAsync(async (req, res) => {
  const result = await PurchaseRequisitionService.getAllFromDBWithoutQuery();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "PurchaseRequisition data fetch!!",
    data: result,
  });
});

const PurchaseRequisitionController = {
  getAllFromDB,
  insertIntoDB,
  getDataById,
  updateOneFromDB,
  deleteIdFromDB,
  getAllFromDBWithoutQuery,
};

module.exports = PurchaseRequisitionController;
