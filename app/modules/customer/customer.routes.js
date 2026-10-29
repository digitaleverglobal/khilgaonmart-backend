const router = require("express").Router();
const auth = require("../../middlewares/auth");
const { uploadAvatar } = require("../../middlewares/upload");
const C = require("./customer.controller");

router.post("/register", C.register);
router.post("/login", C.login);
router.get("/orders", auth(), C.getOrders);
router.get("/rewards", auth(), C.getRewards);
router.get("/profile", auth(), C.getProfile);
router.patch("/profile", auth(), C.updateProfile);
router.patch("/profile/photo", auth(), uploadAvatar, C.updatePhoto);
router.delete("/profile/photo", auth(), C.removePhoto);
router.patch("/change-password", auth(), C.changePassword);

// Admin customer list
router.get("/admin/list", auth(), C.adminList);
router.get("/admin/:id", auth(), C.adminGet);
router.get("/admin/:id/rewards", auth(), C.adminGetRewards);
router.post("/admin/:id/rewards/adjust", auth(), C.adminAdjustRewards);
router.patch("/admin/:id", auth(), C.adminUpdate);
router.delete("/admin/:id", auth(), C.adminDelete);

module.exports = router;
