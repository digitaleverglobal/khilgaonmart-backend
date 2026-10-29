const router = require("express").Router();
const C = require("./tracking.controller");

router.get("/config", C.getPublicConfig);
router.post("/events", C.trackEvent);

module.exports = router;
