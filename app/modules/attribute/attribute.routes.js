const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const AttributeController = require("./attribute.controller");
const router = require("express").Router();

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), AttributeController.insertIntoDB);
router.get("/", auth(), AttributeController.getAllFromDB);
router.get("/all", auth(), AttributeController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), AttributeController.getDataById);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), AttributeController.updateOneFromDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), AttributeController.deleteIdFromDB);

const AttributeRoutes = router;
module.exports = AttributeRoutes;
