const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const {
  requireMenuPermission,
} = require("../../middlewares/requireMenuPermission");
const { uploadUserDocuments } = require("../../middlewares/upload");
const UserController = require("./user.controller");
const ApiError = require("../../../error/ApiError");
const router = require("express").Router();

// Middleware: allow if requesting own profile OR has user_management permission
const selfOrAdmin = (req, res, next) => {
  const requestedId = String(req.params.id);
  const callerId = String(req.user?.Id);
  const role = req.user?.role;

  const isAdmin = [
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
  ].includes(role);

  if (callerId === requestedId || isAdmin) return next();

  return next(new ApiError(403, "Access denied."));
};

// ── Public ──────────────────────────────────────────────
router.post("/login", UserController.login);
router.post("/refresh-token", UserController.refreshToken);
router.post("/register", uploadUserDocuments, UserController.register);

// ── Authenticated ────────────────────────────────────────
router.post("/logout", auth(), UserController.logout);

router.get(
  "/",
  auth(),
  requireMenuPermission("user_management"),
  UserController.getAllUserFromDB,
);

// GET own profile OR admin can get any profile
router.get("/:id", auth(), selfOrAdmin, UserController.getUserById);

// Only superAdmin can change status or impersonate
router.put(
  "/:id/status",
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  requireMenuPermission("user_management"),
  UserController.updateUserStatusFromDB,
);

router.put(
  "/:id/order-distribution",
  auth(),
  requireMenuPermission("user_management"),
  UserController.updateUserOrderDistribution,
);

router.post(
  "/:id/impersonate",
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  requireMenuPermission("user_management"),
  UserController.impersonateUser,
);

router.delete(
  "/:id",
  auth(),
  requireMenuPermission("user_management"),
  UserController.deleteUserFromDB,
);

// PUT: self can update own profile; admin can update any profile
router.put(
  "/:id",
  auth(),
  selfOrAdmin,
  uploadUserDocuments,
  UserController.updateUserFromDB,
);

const UserRoutes = router;
module.exports = UserRoutes;
