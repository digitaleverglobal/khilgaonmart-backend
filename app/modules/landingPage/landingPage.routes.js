const router = require("express").Router();
const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { inlineImagesToFiles } = require("../../../helpers/inlineImages");
const Controller = require("./landingPage.controller");

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), inlineImagesToFiles, Controller.insertIntoDB);
router.get("/header/public", Controller.getHeaderFromDB);
router.get("/footer/public", Controller.getFooterFromDB);
router.get("/public/:id", Controller.getPublicOneFromDB);
router.get("/", auth(), Controller.getAllFromDB);
router.get("/:id", auth(), Controller.getOneFromDB);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), inlineImagesToFiles, Controller.updateOneFromDB);
router.post("/:id/duplicate", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.duplicateIntoDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.deleteIdFromDB);

module.exports = router;
