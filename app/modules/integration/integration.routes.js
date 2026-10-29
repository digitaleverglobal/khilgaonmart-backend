const router = require("express").Router();
const auth = require("../../middlewares/auth");
const C = require("./integration.controller");

router.post("/woocommerce/orders", C.receiveWooCommerceOrder);
router.post("/woocommerce/products", C.receiveWooCommerceProduct);
router.post("/:type/test", auth(), C.test);

module.exports = router;
