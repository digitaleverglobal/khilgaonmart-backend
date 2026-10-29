const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { inlineImagesToFiles } = require("../../../helpers/inlineImages");
const BrandController = require("./brand.controller");
const router = require("express").Router();

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), inlineImagesToFiles, BrandController.insertIntoDB);
router.get("/public", BrandController.getPublicBrands);
router.get("/", auth(), BrandController.getAllFromDB);
router.get("/all", auth(), BrandController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), BrandController.getDataById);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), inlineImagesToFiles, BrandController.updateOneFromDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), BrandController.deleteIdFromDB);

const BrandRoutes = router;
module.exports = BrandRoutes;
