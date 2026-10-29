const router = require("express").Router();
const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const { requireAnyPermission } = require("../../middlewares/requireMenuPermission");
const ChargeSettingController = require("./chargeSetting.controller");

const chargeSettingPermission = requireAnyPermission([
  "cod_change",
  "cod_charge",
  "delivery_advance",
  "delivery_charge",
]);

router.get("/public", ChargeSettingController.getPublicChargeSettings);

router.get(
  "/",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  chargeSettingPermission,
  ChargeSettingController.getChargeSettings,
);
router.post(
  "/create",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  chargeSettingPermission,
  ChargeSettingController.createChargeSetting,
);
router.put(
  "/:id",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  chargeSettingPermission,
  ChargeSettingController.updateChargeSetting,
);
router.delete(
  "/:id",
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  chargeSettingPermission,
  ChargeSettingController.deleteChargeSetting,
);

module.exports = router;
