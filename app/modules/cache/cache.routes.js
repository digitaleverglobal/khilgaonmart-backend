const router = require("express").Router();
const auth = require("../../middlewares/auth");
const { requireMenuPermission } = require("../../middlewares/requireMenuPermission");
const Controller = require("./cache.controller");

router.post("/clear", auth(), requireMenuPermission("cache_clear"), Controller.clear);

module.exports = router;
