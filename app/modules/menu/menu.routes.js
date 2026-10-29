const router = require("express").Router();
const CategoryController = require("../category/category.controller");

router.get("/public", CategoryController.getPublicMenu);

module.exports = router;
