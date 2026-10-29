const { ENUM_USER_ROLE } = require("../../enums/user");
const auth = require("../../middlewares/auth");
const ReviewController = require("./review.controller");
const router = require("express").Router();

router.post("/create", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ReviewController.insertIntoDB);
router.get("/public", ReviewController.getPublicApprovedReviews);
// A logged-in customer reviewing a delivered product.
router.post("/customer", auth(), ReviewController.submitCustomerReview);
router.get("/", auth(), ReviewController.getAllFromDB);
router.get("/all", auth(), ReviewController.getAllFromDBWithoutQuery);
router.get("/:id", auth(), ReviewController.getDataById);
router.put("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ReviewController.updateOneFromDB);
router.delete("/:id", auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.ACCOUNTANT), ReviewController.deleteIdFromDB);

const ReviewRoutes = router;
module.exports = ReviewRoutes;
