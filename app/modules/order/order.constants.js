const ORDER_STATUS = {
  PRE_ORDER: "pre_order",
  PENDING: "pending",
  PACKAGING: "packaging",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  RETURNED: "returned",
  // Returned parcel physically received back; shown only in the Returned submenu.
  RETURN_RECEIVED: "return_received",
  ON_HOLD: "on_hold",
  IN_COURIER: "in_courier",
  DELIVERED: "delivered",
  INCOMPLETE: "incomplete",
};

const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

// Statuses that count as a returned order (Returned tab, stock release, failed delivery).
const RETURN_STATUSES = [ORDER_STATUS.RETURNED, ORDER_STATUS.RETURN_RECEIVED];

const COURIER_OPTIONS = ["Pathao", "Steadfast", "Redx", "Paperfly", "eCourier"];

const ORDER_SEARCHABLE_FIELDS = ["customerName", "customerPhone", "orderId", "ipAddress"];

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  RETURN_STATUSES,
  COURIER_OPTIONS,
  ORDER_SEARCHABLE_FIELDS,
};
