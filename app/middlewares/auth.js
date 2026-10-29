const jwt = require("jsonwebtoken");
const ApiError = require("../../error/ApiError");
const RolePermissionService = require("../modules/rolePermission/rolePermission.service");
const db = require("../../models");

const User = db.user;
const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const auth =
  (...requiredRoles) =>
  async (req, res, next) => {
    try {
      // Get authorization token
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return next(new ApiError(401, "You are not authorized"));

      // Verify token
      const verifiedUser = jwt.verify(token, process.env.TOKEN_SECRET);
      const currentUser = await User.findOne({
        where: { Id: verifiedUser.Id },
        attributes: { exclude: ["Password"] },
      });

      if (!currentUser) {
        return next(new ApiError(401, "User account was not found"));
      }

      const plainUser = currentUser.get({ plain: true });
      const canUseInactiveSession =
        verifiedUser.isImpersonation &&
        verifiedUser.impersonatedByRole === "superAdmin";

      if (plainUser.status === "Inactive" && !canUseInactiveSession) {
        return next(new ApiError(403, "This account is deactivated"));
      }

      req.user = {
        ...verifiedUser,
        ...plainUser,
      }; // Add current user info to request object

      // Some services expect actorRole/userId in payload. Frontend might not send these.
      // We only fill them if missing to avoid overriding intentional values.
      if (req.body && typeof req.body === "object") {
        if (req.body.actorRole === undefined || req.body.actorRole === null) {
          req.body.actorRole = plainUser.role;
        }
        if (req.body.userId === undefined || req.body.userId === null) {
          req.body.userId = plainUser.Id;
        }
      }

      req.menuPermissions =
        await RolePermissionService.getEffectiveMenuPermissions(plainUser.role);

      // Check if the user's role is one of the required roles
      if (
        requiredRoles.length &&
        !requiredRoles.map(normalizeRole).includes(normalizeRole(plainUser.role))
      ) {
        return next(new ApiError(403, "Forbidden"));
      }

      // Proceed to next middleware or route handler
      return next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new ApiError(401, "Invalid token"));
      }
      return next(error);
    }
  };

module.exports = auth;
