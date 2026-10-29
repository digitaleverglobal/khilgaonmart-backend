const { Op } = require("sequelize");
const db = require("../../../models");

const Order = db.order;

// A list search this long looks through every order, not just the assigned ones.
const MIN_OPEN_SEARCH_LENGTH = 3;

// Only admin and superAdmin see every order; everyone else sees the orders assigned to them.
const canSeeAllOrders = (user = {}) =>
  ["superadmin", "admin"].includes(String(user.role || "").trim().toLowerCase());

const scopeOrdersToUser = (where, user = {}) => {
  if (!user?.Id || canSeeAllOrders(user)) return where;
  return { [Op.and]: [where, { assignedEmployeeId: Number(user.Id) }] };
};

const displayName = (user = {}) =>
  [user.FirstName, user.LastName].filter(Boolean).join(" ").trim() ||
  user.Name ||
  user.Email ||
  user.Phone ||
  `User ${user.Id}`;

// Route guard for order changes. Staff can find any order through search and work on
// it; once the change succeeds, the orders it touched are assigned to them.
const assignEditedOrders = (req, res, next) => {
  const user = req.user;
  if (req.method === "GET" || !user?.Id || canSeeAllOrders(user)) return next();
  const ids = [...new Set(
    [req.params.id, ...(Array.isArray(req.body?.orderIds) ? req.body.orderIds : [])]
      .map(Number)
      .filter(Boolean),
  )];
  if (!ids.length) return next();

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const name = displayName(user);
    Order.update(
      {
        assignedEmployeeId: user.Id,
        assignedEmployeeName: name,
        assignedById: user.Id,
        assignedByName: name,
        assignedAt: new Date(),
      },
      {
        where: {
          Id: { [Op.in]: ids },
          [Op.or]: [
            { assignedEmployeeId: { [Op.is]: null } },
            { assignedEmployeeId: { [Op.ne]: user.Id } },
          ],
        },
      },
    ).catch((error) => console.error("Order take-over assignment failed:", error.message));
  });
  return next();
};

module.exports = { MIN_OPEN_SEARCH_LENGTH, canSeeAllOrders, scopeOrdersToUser, assignEditedOrders };
