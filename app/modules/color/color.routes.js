const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const ColorController = require("./color.controller");
const router = require("express").Router();

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ColorController.insertIntoDB);
router.get("/", auth(), ColorController.getAllFromDB);
router.get("/all", auth(), ColorController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), ColorController.getDataById);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ColorController.updateOneFromDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ColorController.deleteIdFromDB);

const ColorRoutes = router;
module.exports = ColorRoutes;
