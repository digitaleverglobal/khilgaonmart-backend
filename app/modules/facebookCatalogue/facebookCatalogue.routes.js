const router = require("express").Router();
const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const C = require("./facebookCatalogue.controller");

router.get("/feed.xml", C.getFeed);
router.post("/refresh", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), C.refresh);

module.exports = router;
