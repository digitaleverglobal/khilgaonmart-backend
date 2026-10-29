const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { inlineImagesToFiles } = require("../../../helpers/inlineImages");
const SubcategoryController = require("./subcategory.controller");
const router = require("express").Router();

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), inlineImagesToFiles, SubcategoryController.insertIntoDB);
router.get("/", auth(), SubcategoryController.getAllFromDB);
router.get("/all", auth(), SubcategoryController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), SubcategoryController.getDataById);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), inlineImagesToFiles, SubcategoryController.updateOneFromDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), SubcategoryController.deleteIdFromDB);

const SubcategoryRoutes = router;
module.exports = SubcategoryRoutes;
