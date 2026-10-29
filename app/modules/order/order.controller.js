const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const ApiError = require("../../../error/ApiError");
const OrderService = require("./order.service");
const OrderFraudCheckService = require("./orderFraudCheck.service");
const { ORDER_LIST_FILTER_KEYS } = require("./orderFilters");
const TrackingService = require("../tracking/tracking.service");
const { getClientIp } = require("../../utils/clientIp");
const jwt = require("jsonwebtoken");
const db = require("../../../models");

// Checkout is open to guests; a logged-in customer's token (if sent) lets them
// spend reward points. A bad or missing token just means "guest".
const getOptionalCustomerPhone = async (req) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;
  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    const user = await db.user.findOne({ where: { Id: verified.Id }, attributes: ["Phone", "status"] });
    return user && user.status !== "Inactive" ? user.Phone : null;
  } catch {
    return null;
  }
};

// Retain the same ID on retries and in the browser for platform deduplication.
async function deliverPurchase(payload, context) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await TrackingService.trackEvent(payload, context);
      if (result.results.every((item) => item.ok || item.skipped)) return;
    } catch {
      // Tracking failures must never turn a saved order into a failed checkout.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  console.warn("Purchase tracking delivery failed", payload.eventId);
}

const createOrder = catchAsync(async (req, res) => {
  const result = await OrderService.createOrderInDB({
    ...req.body,
    ipAddress: getClientIp(req),
  }, { customerPhone: await getOptionalCustomerPhone(req) });
  if (req.body.landingTracking?.enabled === true) {
    const eventId = `Purchase.order.${result.Id || result.orderId}`;
    result.purchaseEventId = eventId;
    void deliverPurchase({
      eventName: "Purchase",
      eventId,
      eventSourceUrl: req.body.landingTracking.eventSourceUrl,
      userData: {
        ...(req.body.tracking || {}),
        name: result.customerName,
        phone: result.customerPhone,
        customerId: result.customerId,
      },
      customData: {
        ...(req.body.landingTracking.customData || {}),
        value: Number(result.totalBill),
        currency: "BDT",
        order_id: result.orderId || result.Id,
      },
    }, { headers: req.headers, ip: getClientIp(req) });
  }
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Order created successfully",
    data: result,
  });
});

const createStaffOrder = catchAsync(async (req, res) => {
  const result = await OrderService.createStaffOrderInDB(req.body, req.user);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Order created successfully",
    data: result,
  });
});

const saveIncompleteOrder = catchAsync(async (req, res) => {
  const result = await OrderService.saveIncompleteOrderInDB({
    ...req.body,
    ipAddress: getClientIp(req),
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Incomplete order saved successfully",
    data: result,
  });
});

const getOrders = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    "status",
    "search",
    "fromDate",
    "toDate",
    "assignedEmployeeId",
    ...ORDER_LIST_FILTER_KEYS,
  ]);
  const paginationOptions = pick(req.query, ["page", "limit", "sortBy", "sortOrder"]);
  const result = await OrderService.getOrdersFromDB(filters, paginationOptions, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getOrderFilterOptions = catchAsync(async (req, res) => {
  const result = await OrderService.getOrderFilterOptionsFromDB();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order filter options fetched successfully",
    data: result,
  });
});

const pickOrderListFilters = (query) =>
  pick(query, ["status", "search", "fromDate", "toDate", "assignedEmployeeId", ...ORDER_LIST_FILTER_KEYS]);

const getOrderReport = catchAsync(async (req, res) => {
  const filters = pickOrderListFilters(req.query);
  const result = await OrderService.getOrderReportFromDB(req.params.type, filters, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order report fetched successfully",
    data: result,
  });
});

const getSalesSummary = catchAsync(async (req, res) => {
  const result = await OrderService.getSalesSummaryFromDB(pickOrderListFilters(req.query), req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Sales summary fetched successfully",
    data: result,
  });
});

const getPackingList = catchAsync(async (req, res) => {
  const options = pick(req.query, ["groupBy", "includeReturns", "includeOtherProducts", "upsales", "createTimeOnly"]);
  const result = await OrderService.getPackingListFromDB(pickOrderListFilters(req.query), options, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Packing list fetched successfully",
    data: result,
  });
});

const bulkOrderAction = catchAsync(async (req, res) => {
  const result = await OrderService.bulkOrderActionInDB(req.body, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `${result.updated} order(s) updated`,
    data: result,
  });
});

const sendSmsToOrders = catchAsync(async (req, res) => {
  const result = await OrderService.sendSmsToOrdersInDB(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const markOrdersPrinted = catchAsync(async (req, res) => {
  const result = await OrderService.markOrdersPrintedInDB(req.body.orderIds);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders marked as printed",
    data: result,
  });
});

const getPathaoCities = catchAsync(async (req, res) => {
  const result = await OrderService.getPathaoCitiesFromProvider();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Pathao cities fetched successfully",
    data: result,
  });
});

const getPathaoZones = catchAsync(async (req, res) => {
  const result = await OrderService.getPathaoZonesFromProvider(req.params.cityId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Pathao zones fetched successfully",
    data: result,
  });
});

const getOrderStatusCounts = catchAsync(async (req, res) => {
  const result = await OrderService.getOrderStatusCountsFromDB(req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order status counts fetched successfully",
    data: result,
  });
});

const getOrderById = catchAsync(async (req, res) => {
  const result = await OrderService.getOrderByIdFromDB(req.params.id, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order fetched successfully",
    data: result,
  });
});

const addOrderAttachment = catchAsync(async (req, res) => {
  const result = await OrderService.addOrderAttachmentInDB(req.params.id, req.file, req.user);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Attachment added",
    data: result,
  });
});

const getPhoneFraudCheck = catchAsync(async (req, res) => {
  const phone = String(req.query.phone || "").trim();
  if (!phone) throw new ApiError(400, "phone is required");
  const [check, courierSummary, lastCustomer] = await Promise.all([
    OrderFraudCheckService.getPhoneFraudCheck(phone),
    OrderService.getCustomerSummaryByPhone(phone),
    OrderService.getLastCustomerByPhone(phone),
  ]);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phone fraud check fetched successfully",
    data: { ...check, courierSummary, lastCustomer },
  });
});

const getOrderFraudCheck = catchAsync(async (req, res) => {
  const result = await OrderFraudCheckService.getFraudCheckFromDB(req.params.id, {
    refresh: req.query.refresh === "1" || req.query.refresh === "true",
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order fraud check fetched successfully",
    data: result,
  });
});

const getAssignableEmployees = catchAsync(async (req, res) => {
  const result = await OrderService.getAssignableEmployeesFromDB();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Assignable employees fetched successfully",
    data: result,
  });
});

const bulkAssignOrdersToEmployee = catchAsync(async (req, res) => {
  const result = await OrderService.bulkAssignOrdersToEmployeeInDB(
    req.body.orderIds || [],
    req.body.employeeId,
    req.user,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders assigned successfully",
    data: result,
  });
});

const trackOrdersByPhone = catchAsync(async (req, res) => {
  const result = await OrderService.trackOrdersByPhoneFromDB(req.query.phone, req.query.invoiceId, {
    includeHistory: req.query.history === "true",
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders tracked successfully",
    data: result,
  });
});

const sendReconfirmOtp = catchAsync(async (req, res) => {
  const result = await OrderService.sendOrderReconfirmOtpInDB(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.alreadyConfirmed
      ? "Order is already confirmed"
      : "OTP sent successfully",
    data: result,
  });
});

const verifyReconfirmOtp = catchAsync(async (req, res) => {
  const result = await OrderService.verifyOrderReconfirmOtpInDB(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order confirmed successfully",
    data: result,
  });
});

const updateOrder = catchAsync(async (req, res) => {
  const result = await OrderService.updateOrderInDB(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order updated successfully",
    data: result,
  });
});

const updateOrderStatus = catchAsync(async (req, res) => {
  const result = await OrderService.updateOrderStatusInDB(req.params.id, req.body.status, req.user.Id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order status updated successfully",
    data: result,
  });
});

const sendOrderToSteadfast = catchAsync(async (req, res) => {
  const result = await OrderService.sendOrderToSteadfastInDB(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order sent to Steadfast successfully",
    data: result,
  });
});

const sendOrderToPathao = catchAsync(async (req, res) => {
  const result = await OrderService.sendOrderToPathaoInDB(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order sent to Pathao successfully",
    data: result,
  });
});

const bulkSendOrdersToSteadfast = catchAsync(async (req, res) => {
  const result = await OrderService.bulkSendOrdersToSteadfastInDB(req.body.orderIds || [], req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders sent to Steadfast successfully",
    data: result,
  });
});

const bulkSendOrdersToPathao = catchAsync(async (req, res) => {
  const result = await OrderService.bulkSendOrdersToPathaoInDB(req.body.orderIds || [], req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Orders sent to Pathao successfully",
    data: result,
  });
});

const syncSteadfastStatus = catchAsync(async (req, res) => {
  const result = await OrderService.syncSteadfastStatusInDB(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Steadfast status synced successfully",
    data: result,
  });
});

const syncPathaoStatus = catchAsync(async (req, res) => {
  const result = await OrderService.syncPathaoStatusInDB(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Pathao status synced successfully",
    data: result,
  });
});

const getSteadfastBalance = catchAsync(async (req, res) => {
  const result = await OrderService.getSteadfastBalanceFromProvider();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Steadfast balance fetched successfully",
    data: result,
  });
});

const createSteadfastReturnRequest = catchAsync(async (req, res) => {
  const result = await OrderService.createSteadfastReturnRequestInDB(req.params.id, req.body.reason);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Steadfast return request created successfully",
    data: result,
  });
});

const getSteadfastReturnRequests = catchAsync(async (req, res) => {
  const result = await OrderService.getSteadfastReturnRequestsFromProvider();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Steadfast return requests fetched successfully",
    data: result,
  });
});

const getSteadfastPayments = catchAsync(async (req, res) => {
  const result = await OrderService.getSteadfastPaymentsFromProvider(req.params.paymentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Steadfast payments fetched successfully",
    data: result,
  });
});

const getSteadfastPoliceStations = catchAsync(async (req, res) => {
  const result = await OrderService.getSteadfastPoliceStationsFromProvider();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Steadfast police stations fetched successfully",
    data: result,
  });
});

const deleteOrder = catchAsync(async (req, res) => {
  const result = await OrderService.deleteOrderFromDB(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const OrderController = {
  createOrder,
  createStaffOrder,
  saveIncompleteOrder,
  getOrders,
  getOrderStatusCounts,
  getOrderFilterOptions,
  getOrderReport,
  getSalesSummary,
  getPackingList,
  bulkOrderAction,
  sendSmsToOrders,
  markOrdersPrinted,
  getPathaoCities,
  getPathaoZones,
  getOrderById,
  addOrderAttachment,
  getOrderFraudCheck,
  getPhoneFraudCheck,
  getAssignableEmployees,
  bulkAssignOrdersToEmployee,
  trackOrdersByPhone,
  sendReconfirmOtp,
  verifyReconfirmOtp,
  updateOrder,
  updateOrderStatus,
  sendOrderToSteadfast,
  sendOrderToPathao,
  bulkSendOrdersToSteadfast,
  bulkSendOrdersToPathao,
  syncSteadfastStatus,
  syncPathaoStatus,
  getSteadfastBalance,
  createSteadfastReturnRequest,
  getSteadfastReturnRequests,
  getSteadfastPayments,
  getSteadfastPoliceStations,
  deleteOrder,
};

module.exports = OrderController;
