const ApiError = require("../../error/ApiError");

const requireRoles =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "You are not authorized"));
    }

    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden"));
    }

    return next();
  };

module.exports = requireRoles;
