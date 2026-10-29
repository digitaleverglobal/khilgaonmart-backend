const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const VariationController = require("./variation.controller");
const router = require("express").Router();

router.post(
  "/create",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  VariationController.insertIntoDB,
);
router.get("/", auth(), VariationController.getAllFromDB);
router.get("/all", auth(), VariationController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), VariationController.getDataById);
router.delete(
  "/:id",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  VariationController.deleteIdFromDB,
);
router.put(
  "/:id",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  VariationController.updateOneFromDB,
);

const VariationRoutes = router;
module.exports = VariationRoutes;
