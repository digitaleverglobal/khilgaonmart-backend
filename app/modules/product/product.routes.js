const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const {
  applyApprovalWorkflow,
  approvePendingWorkflow,
} = require("../../middlewares/approvalRouteWorkflow");
const { uploadMultiple } = require("../../middlewares/upload");
const ProductController = require("./product.controller");
const router = require("express").Router();

router.post(
  "/create",
  auth(),
  uploadMultiple,
  applyApprovalWorkflow({ modelKey: "product", entityLabel: "Product" }),
  ProductController.insertIntoDB,
);
router.get(
  "/",
  // auth(),
  ProductController.getAllFromDB,
);
router.get("/storefront", ProductController.getStorefrontProducts);
router.get("/storefront/best-selling", ProductController.getBestSellingProducts);
router.get("/storefront/:id", ProductController.getStorefrontProductById);
router.get("/all", auth(), ProductController.getAllFromDBWithoutQuery);
router.get("/stock/:id", auth(), ProductController.getDataById);
router.get("/:id", auth(), ProductController.getReceivedDataById);
router.delete(
  "/:id",
  auth(),
  applyApprovalWorkflow({ modelKey: "product", entityLabel: "Product" }),
  ProductController.deleteIdFromDB,
);
router.put(
  "/:id",
  auth(),
  uploadMultiple,
  applyApprovalWorkflow({ modelKey: "product", entityLabel: "Product" }),
  ProductController.updateOneFromDB,
);
router.post("/:id/duplicate", auth(), ProductController.duplicateProduct);
router.post(
  "/:id/approve",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  approvePendingWorkflow({ modelKey: "product", entityLabel: "Product" }),
);

const ProductRoutes = router;
module.exports = ProductRoutes;
