const router = require("express").Router();
const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const Controller = require("./websitePage.controller");

router.get(   "/public",       Controller.getPublicFromDB);
router.get(   "/public/:slug",  Controller.getPublicBySlugFromDB);
router.post(  "/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.insertIntoDB);
router.get(   "/",       auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.getAllFromDB);
router.get(   "/:id",    auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.getDataById);
router.put(   "/:id",    auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.updateOneFromDB);
router.delete("/:id",    auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), Controller.deleteIdFromDB);

module.exports = router;
