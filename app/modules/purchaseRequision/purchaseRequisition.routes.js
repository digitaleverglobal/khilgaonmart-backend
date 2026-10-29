const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const {
  applyApprovalWorkflow,
  approvePendingWorkflow,
} = require("../../middlewares/approvalRouteWorkflow");
const PurchaseRequisitionController = require("./purchaseRequisition.controller");
const { uploadFile } = require("../../middlewares/upload");
const router = require("express").Router();

router.post(
  "/create",
  uploadFile,
  auth(),
  applyApprovalWorkflow({
    modelKey: "purchaseRequisition",
    entityLabel: "Purchase Requisition",
  }),
  PurchaseRequisitionController.insertIntoDB,
);
router.get("/", auth(), PurchaseRequisitionController.getAllFromDB);
router.get("/all", auth(), PurchaseRequisitionController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), PurchaseRequisitionController.getDataById);
router.delete(
  "/:id",
  auth(),
  applyApprovalWorkflow({
    modelKey: "purchaseRequisition",
    entityLabel: "Purchase Requisition",
  }),
  PurchaseRequisitionController.deleteIdFromDB,
);
router.put(
  "/:id",
  uploadFile,
  auth(),
  applyApprovalWorkflow({
    modelKey: "purchaseRequisition",
    entityLabel: "Purchase Requisition",
    updatePrivilegedRoles: [
      ENUM_USER_ROLE.SUPER_ADMIN,
      ENUM_USER_ROLE.ADMIN,
      ENUM_USER_ROLE.ACCOUNTANT,
      ENUM_USER_ROLE.INVENTOR,
    ],
  }),
  PurchaseRequisitionController.updateOneFromDB,
);
router.post(
  "/:id/approve",
  uploadFile,
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  approvePendingWorkflow({
    modelKey: "purchaseRequisition",
    entityLabel: "Purchase Requisition",
  }),
);

const PurchaseRequisitionRoutes = router;
module.exports = PurchaseRequisitionRoutes;
