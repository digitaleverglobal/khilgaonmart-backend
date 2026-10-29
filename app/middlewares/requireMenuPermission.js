const ApiError = require("../../error/ApiError");
const RolePermissionService = require("../modules/rolePermission/rolePermission.service");

const loadPermissions = async (req) => {
  if (!req.user) {
    throw new ApiError(401, "You are not authorized");
  }

  if (!req.menuPermissions) {
    req.menuPermissions =
      await RolePermissionService.getEffectiveMenuPermissions(req.user.role);
  }

  return req.menuPermissions;
};

const requireMenuPermission =
  (requiredPermission) => async (req, res, next) => {
    try {
      const permissions = await loadPermissions(req);

      if (
        !RolePermissionService.hasMenuPermission(
          permissions,
          requiredPermission,
        )
      ) {
        return next(new ApiError(403, "Permission denied"));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };

const requireAnyPermission =
  (requiredPermissions = []) =>
  async (req, res, next) => {
    try {
      const permissions = await loadPermissions(req);
      const matched = requiredPermissions.some((permission) =>
        RolePermissionService.hasMenuPermission(permissions, permission),
      );

      if (!matched) {
        return next(new ApiError(403, "Permission denied"));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  requireMenuPermission,
  requireAnyPermission,
};
