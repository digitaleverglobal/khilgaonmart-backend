const router = require("express").Router();
const auth = require("../../middlewares/auth");
const { getStats } = require("./dashboard.controller");

router.get("/stats", auth(), getStats);

module.exports = router;
