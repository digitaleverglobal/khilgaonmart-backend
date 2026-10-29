const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { inlineImagesToFiles } = require("../../../helpers/inlineImages");
const ChildcategoryController = require("./childcategory.controller");
const router = require("express").Router();

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), inlineImagesToFiles, ChildcategoryController.insertIntoDB);
router.get("/", auth(), ChildcategoryController.getAllFromDB);
router.get("/all", auth(), ChildcategoryController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), ChildcategoryController.getDataById);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), inlineImagesToFiles, ChildcategoryController.updateOneFromDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ChildcategoryController.deleteIdFromDB);

const ChildcategoryRoutes = router;
module.exports = ChildcategoryRoutes;
