const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const {
  applyApprovalWorkflow,
  approvePendingWorkflow,
} = require("../../middlewares/approvalRouteWorkflow");
const SupplierController = require("./supplier.controller");
const router = require("express").Router();

router.post(
  "/create",
  auth(),
  applyApprovalWorkflow({ modelKey: "supplier", entityLabel: "Supplier" }),
  SupplierController.insertIntoDB,
);
router.get("/", auth(), SupplierController.getAllFromDB);
router.get("/all", auth(), SupplierController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), SupplierController.getDataById);
router.delete(
  "/:id",
  auth(),
  applyApprovalWorkflow({ modelKey: "supplier", entityLabel: "Supplier" }),
  SupplierController.deleteIdFromDB,
);
router.put(
  "/:id",
  auth(),
  applyApprovalWorkflow({ modelKey: "supplier", entityLabel: "Supplier" }),
  SupplierController.updateOneFromDB,
);
router.post(
  "/:id/approve",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  approvePendingWorkflow({ modelKey: "supplier", entityLabel: "Supplier" }),
);
const SupplierRoutes = router;
module.exports = SupplierRoutes;
