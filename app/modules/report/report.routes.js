const router = require("express").Router();
const auth = require("../../middlewares/auth");
const C = require("./report.controller");
router.get("/options", auth(), C.getOptions);
router.get("/:type", auth(), C.getReport);
module.exports = router;
