const express = require("express");
const UserRoutes = require("../modules/user/user.routes");
const CustomerRoutes = require("../modules/customer/customer.routes");
const RolePermissionRoutes = require("../modules/rolePermission/rolePermission.routes");
const ProductRoutes = require("../modules/product/product.routes");
const VariationRoutes = require("../modules/variation/variation.routes");
const CategoryRoutes = require("../modules/category/category.routes");
const MenuRoutes = require("../modules/menu/menu.routes");
const SubcategoryRoutes = require("../modules/subcategory/subcategory.routes");
const ChildcategoryRoutes = require("../modules/childcategory/childcategory.routes");
const BrandRoutes = require("../modules/brand/brand.routes");
const ColorRoutes = require("../modules/color/color.routes");
const AttributeRoutes = require("../modules/attribute/attribute.routes");
const ReviewRoutes = require("../modules/review/review.routes");
const SupplierRoutes = require("../modules/supplier/supplier.routes");
const SupplierHistoryRoutes = require("../modules/supplierHistory/supplierHistory.routes");
const PurchaseRequisitionRoutes = require("../modules/purchaseRequision/purchaseRequisition.routes");
const OrderRoutes = require("../modules/order/order.routes");
const ChargeSettingRoutes = require("../modules/chargeSetting/chargeSetting.routes");
const IpBlockRoutes       = require("../modules/ipBlock/ipBlock.routes");
const SiteSettingRoutes   = require("../modules/siteSetting/siteSetting.routes");
const OrderStatusRoutes   = require("../modules/orderStatus/orderStatus.routes");
const DeliveryAreaRoutes  = require("../modules/deliveryArea/deliveryArea.routes");
const WebsitePageRoutes   = require("../modules/websitePage/websitePage.routes");
const TagManagerRoutes    = require("../modules/tagManager/tagManager.routes");
const FacebookPixelRoutes = require("../modules/facebookPixel/facebookPixel.routes");
const TiktokPixelRoutes   = require("../modules/tiktokPixel/tiktokPixel.routes");
const GoogleAdsRoutes     = require("../modules/googleAds/googleAds.routes");
const BannerCategoryRoutes = require("../modules/bannerCategory/bannerCategory.routes");
const BannerRoutes        = require("../modules/banner/banner.routes");
const TrackingRoutes      = require("../modules/tracking/tracking.routes");
const CouponCodeRoutes    = require("../modules/couponCode/couponCode.routes");
const VisitorStatRoutes        = require("../modules/visitorStat/visitorStat.routes");
const SmsMarketingRoutes       = require("../modules/smsMarketing/smsMarketing.routes");
const FacebookCatalogueRoutes  = require("../modules/facebookCatalogue/facebookCatalogue.routes");
const DashboardRoutes          = require("../modules/dashboard/dashboard.routes");
const LandingPageRoutes        = require("../modules/landingPage/landingPage.routes");
const ComboOfferRoutes         = require("../modules/comboOffer/comboOffer.routes");
const NotificationRoutes       = require("../modules/notification/notification.routes");
const ExpenseRoutes            = require("../modules/expense/expense.routes");
const ReportRoutes             = require("../modules/report/report.routes");
const CacheRoutes              = require("../modules/cache/cache.routes");
const IntegrationRoutes        = require("../modules/integration/integration.routes");

const router = express.Router();

const moduleRoutes = [
  { path: "/user",                 route: UserRoutes },
  { path: "/customer",             route: CustomerRoutes },
  { path: "/role-permissions",     route: RolePermissionRoutes },
  { path: "/product",              route: ProductRoutes },
  { path: "/variation",            route: VariationRoutes },
  { path: "/category",             route: CategoryRoutes },
  { path: "/menu",                 route: MenuRoutes },
  { path: "/subcategory",          route: SubcategoryRoutes },
  { path: "/childcategory",        route: ChildcategoryRoutes },
  { path: "/brand",                route: BrandRoutes },
  { path: "/color",                route: ColorRoutes },
  { path: "/attribute",            route: AttributeRoutes },
  { path: "/review",               route: ReviewRoutes },
  { path: "/supplier",             route: SupplierRoutes },
  { path: "/supplier-history",     route: SupplierHistoryRoutes },
  { path: "/purchase-requisition", route: PurchaseRequisitionRoutes },
  { path: "/orders",               route: OrderRoutes },
  { path: "/customer-order",        route: OrderRoutes },
  { path: "/charge-settings",      route: ChargeSettingRoutes },
  { path: "/ip-blocks",            route: IpBlockRoutes },
  { path: "/site-settings",        route: SiteSettingRoutes },
  { path: "/order-status",         route: OrderStatusRoutes },
  { path: "/delivery-areas",       route: DeliveryAreaRoutes },
  { path: "/website-pages",        route: WebsitePageRoutes },
  { path: "/tag-managers",         route: TagManagerRoutes },
  { path: "/facebook-pixels",      route: FacebookPixelRoutes },
  { path: "/tiktok-pixels",        route: TiktokPixelRoutes },
  { path: "/google-ads",           route: GoogleAdsRoutes },
  { path: "/banner-categories",    route: BannerCategoryRoutes },
  { path: "/banners",              route: BannerRoutes },
  { path: "/tracking",             route: TrackingRoutes },
  { path: "/coupon-codes",         route: CouponCodeRoutes },
  { path: "/visitor-stats",        route: VisitorStatRoutes },
  { path: "/sms-marketing",        route: SmsMarketingRoutes },
  { path: "/facebook-catalogue",   route: FacebookCatalogueRoutes },
  { path: "/dashboard",            route: DashboardRoutes },
  { path: "/landing-pages",        route: LandingPageRoutes },
  { path: "/combo-offers",         route: ComboOfferRoutes },
  { path: "/notifications",        route: NotificationRoutes },
  { path: "/expenses",             route: ExpenseRoutes },
  { path: "/reports",              route: ReportRoutes },
  { path: "/cache",                route: CacheRoutes },
  { path: "/integrations",         route: IntegrationRoutes },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));
module.exports = router;
