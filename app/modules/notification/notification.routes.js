const router = require("express").Router();
const auth = require("../../middlewares/auth");
const Controller = require("./notification.controller");

router.get("/", auth(), Controller.getMine);
router.get("/unread-count", auth(), Controller.getUnreadCount);
router.patch("/read-all", auth(), Controller.markAllAsRead);
router.patch("/:id/read", auth(), Controller.markAsRead);
router.post("/:id/read", auth(), Controller.markAsRead);
router.delete("/:id", auth(), Controller.removeMine);

module.exports = router;
