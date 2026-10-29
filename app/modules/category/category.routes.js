const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { inlineImagesToFiles } = require("../../../helpers/inlineImages");
const CategoryController = require("./category.controller");
const router = require("express").Router();

router.post(
  "/create",
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.ACCOUNTANT,
  ),
  inlineImagesToFiles,
  CategoryController.insertIntoDB,
);
router.get("/", auth(), CategoryController.getAllFromDB);
router.get("/all", auth(), CategoryController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), CategoryController.getDataById);
router.delete(
  "/:id",
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.ACCOUNTANT,
  ),
  CategoryController.deleteIdFromDB,
);
router.put(
  "/:id",
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.ACCOUNTANT,
  ),
  inlineImagesToFiles,
  CategoryController.updateOneFromDB,
);
const CategoryRoutes = router;
module.exports = CategoryRoutes;
