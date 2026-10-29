const router = require("express").Router();
const auth = require("../../middlewares/auth");
const { ENUM_USER_ROLE } = require("../../enums/user");
const C = require("./visitorStat.controller");

router.post("/track", C.track);
router.get("/stats",  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), C.getStats);

module.exports = router;
