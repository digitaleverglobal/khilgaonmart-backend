const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { inlineImagesToFiles } = require("../../../helpers/inlineImages");
const ComboOfferController = require("./comboOffer.controller");
const router = require("express").Router();

const editors = [ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT];

router.post("/create", auth(...editors), inlineImagesToFiles, ComboOfferController.insertIntoDB);
router.get("/public", ComboOfferController.getPublicCombos);
router.get("/public/:id", ComboOfferController.getPublicComboById);
router.get("/", auth(), ComboOfferController.getAllFromDB);
router.get("/:id", auth(), ComboOfferController.getDataById);
router.put("/:id", auth(...editors), inlineImagesToFiles, ComboOfferController.updateOneFromDB);
router.delete("/:id", auth(...editors), ComboOfferController.deleteIdFromDB);

module.exports = router;
