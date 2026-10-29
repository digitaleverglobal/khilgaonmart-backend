const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const SupplierHistoryController = require("./supplierHistory.controller");
const router = require("express").Router();

router.post(
  "/create",
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.INVENTOR,
  ),
  SupplierHistoryController.insertIntoDB,
);
router.get("/", auth(), SupplierHistoryController.getAllFromDB);
router.get("/all", auth(), SupplierHistoryController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), SupplierHistoryController.getDataById);
router.delete(
  "/:id",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  SupplierHistoryController.deleteIdFromDB,
);
router.put(
  "/:id",
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.INVENTOR,
  ),
  SupplierHistoryController.updateOneFromDB,
);

const SupplierHistoryRoutes = router;
module.exports = SupplierHistoryRoutes;
