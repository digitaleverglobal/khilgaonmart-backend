const router = require("express").Router();
const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const Controller = require("./siteSetting.controller");

router.get("/public", Controller.getPublic);
router.get("/:settingType", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.getByType);
router.put("/:settingType", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.upsert);

module.exports = router;
