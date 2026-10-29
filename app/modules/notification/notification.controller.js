const catchAsync = require("../../../shared/catchAsync");
const sendResponse = require("../../../shared/sendResponse");
const pick = require("../../../shared/pick");
const Service = require("./notification.service");

const getMine = catchAsync(async (req, res) => {
  const result = await Service.getMine(
    req.user.Id,
    pick(req.query, ["unreadOnly"]),
    pick(req.query, ["page", "limit"]),
  );
  sendResponse(res, { statusCode: 200, success: true, message: "Notifications fetched", meta: result.meta, data: result.data });
});

const getUnreadCount = catchAsync(async (req, res) => {
  const count = await Service.getUnreadCount(req.user.Id);
  sendResponse(res, { statusCode: 200, success: true, message: "Unread count fetched", data: { count } });
});

const markAsRead = catchAsync(async (req, res) => {
  const result = await Service.markAsRead(req.user.Id, req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Notification marked as read", data: result });
});

const markAllAsRead = catchAsync(async (req, res) => {
  const result = await Service.markAllAsRead(req.user.Id);
  sendResponse(res, { statusCode: 200, success: true, message: "All notifications marked as read", data: result });
});

const removeMine = catchAsync(async (req, res) => {
  const result = await Service.removeMine(req.user.Id, req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: "Notification deleted", data: result });
});

module.exports = { getMine, getUnreadCount, markAsRead, markAllAsRead, removeMine };
