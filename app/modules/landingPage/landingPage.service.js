const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const { getLandingOptions, getLandingVariants, loadProducts } = require("../order/orderPricing");

const LandingPage = () => db.landingPage;
const Product = () => db.product;

const DEFAULT_HEADER = {
  helpText: "Need any help? Call",
  supportPhone: "+8809647-222999",
  supportText: "Contact support",
  supportUrl: "",
  trackOrderText: "🚚 Track your order",
  followUsText: "Follow us:",
  socialLinks: [
    { platform: "facebook", label: "Facebook", url: "" },
    { platform: "youtube", label: "YouTube", url: "" },
    { platform: "tiktok", label: "TikTok", url: "" },
    { platform: "instagram", label: "Instagram", url: "" },
  ],
  logoUrl: null,
  logoAlt: "Website logo",
  backgroundColor: "#1d1d1b",
  textColor: "#ffffff",
  accentColor: "#fbbf24",
  status: true,
};

const DEFAULT_FOOTER = {
  logoUrl: null,
  companyName: "কাফেলা",
  supportLabel: "Customer Supports:",
  supportPhone: "+8809647-222999",
  description: "Corporate and promotional gift item supplier in Bangladesh",
  address: "500/3 Khilgaon Niribili Society, Dhaka Bangladesh",
  quickLinksTitle: "Quick Links",
  quickLinks: [
    { label: "Customer Support", url: "/contact-us" },
    { label: "All Products", url: "/products" },
    { label: "Categories", url: "/categories" },
    { label: "Track My Order", url: "/track-order" },
  ],
  socialLinksTitle: "Follow Us",
  socialLinks: [
    { platform: "facebook", label: "facebook", url: "" },
    { platform: "youtube", label: "youtube", url: "" },
    { platform: "tiktok", label: "tiktok", url: "" },
    { platform: "instagram", label: "instagram", url: "" },
  ],
  importantLinksTitle: "Important Links",
  importantLinks: [{ label: "Refund Policy", url: "/refund-policy" }],
  paymentMethodsImageUrl: null,
  copyrightText: "কাফেলা © 2026.",
  developerText: "Develop by SOFT-HEXIS",
  developerUrl: "",
  status: true,
};

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return parseObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return !Array.isArray(value) && typeof value === "object" ? value : {};
};

const getHeaderFromDB = async () => {
  const row = await db.siteSetting.findOne({ where: { settingType: "header" } });
  return { ...DEFAULT_HEADER, ...parseObject(row?.data) };
};

const getFooterFromDB = async () => {
  const row = await db.siteSetting.findOne({ where: { settingType: "footer" } });
  return { ...DEFAULT_FOOTER, ...parseObject(row?.data) };
};

const normalizePayload = async (payload = {}) => {
  const productId = payload.productId ? Number(payload.productId) : null;
  let product = payload.product || null;

  if (productId && Product()) {
    const productRow = await Product().findOne({ where: { Id: productId } });
    product = productRow?.name || product;
  }

  return {
    pageType: payload.pageType || "Campaign",
    productId,
    product,
    title: payload.title || payload.campaignTitle || product || "Untitled Campaign",
    subTitle: payload.subTitle || null,
    bannerImageUrl: payload.bannerImageUrl || null,
    prizeImageUrl: payload.prizeImageUrl || null,
    reviewImages: payload.reviewImages
      ? (typeof payload.reviewImages === "string" ? payload.reviewImages : JSON.stringify(payload.reviewImages))
      : null,
    shortDescription: payload.shortDescription || null,
    video: payload.video || null,
    reviewTitle: payload.reviewTitle === undefined ? null : payload.reviewTitle,
    descriptionTitle: payload.descriptionTitle || null,
    description: payload.description || null,
    whyChooseTitle: payload.whyChooseTitle || null,
    whyChooseUs: payload.whyChooseUs || null,
    price: payload.price === undefined || payload.price === "" ? null : Number(payload.price),
    originalPrice: payload.originalPrice === undefined || payload.originalPrice === "" ? null : Number(payload.originalPrice),
    phone: payload.phone || null,
    template: payload.template || payload.campaignTemplate || "Template Design 1",
    countdown: payload.countdown || payload.countdownTime || null,
    regularData: payload.regularData
      ? (typeof payload.regularData === "string" ? payload.regularData : JSON.stringify(payload.regularData))
      : null,
    status: payload.status === undefined ? true : Boolean(payload.status),
  };
};

const insertIntoDB = async (payload) => LandingPage().create(await normalizePayload(payload));

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm } = filters || {};
  const where = searchTerm
    ? {
      [Op.or]: [
        { title: { [Op.like]: `%${searchTerm}%` } },
        { product: { [Op.like]: `%${searchTerm}%` } },
        { template: { [Op.like]: `%${searchTerm}%` } },
      ],
    }
    : {};

  const [data, count] = await Promise.all([
    LandingPage().findAll({ where, offset: skip, limit, order: [["createdAt", "DESC"]], paranoid: true }),
    LandingPage().count({ where }),
  ]);

  return { meta: { count, page, limit }, data };
};

const getOneFromDB = async (id) => {
  const row = await LandingPage().findOne({ where: { Id: id }, paranoid: true });
  if (!row) throw new ApiError(404, "Landing page not found");
  return row;
};

const getPublicOneFromDB = async (id) => {
  const row = await LandingPage().findOne({
    where: { Id: id, status: true },
    paranoid: true,
  });
  if (!row) throw new ApiError(404, "Landing page not found or inactive");

  // Free-shipping flags and variation chips come from the linked products, so the
  // storefront shows the same chips and prices the order API accepts.
  const options = getLandingOptions(row);
  const products = await loadProducts(options.map((option) => option.linkedProductId).filter(Boolean));
  const variantsByProduct = {};
  options.forEach((option) => {
    const product = option.linkedProductId && products.get(Number(option.linkedProductId));
    const variants = getLandingVariants(option, product);
    if (variants.length) variantsByProduct[String(option.linkedProductId || option.productId)] = variants;
  });
  return {
    ...row.get({ plain: true }),
    freeShippingProductIds: [...products.values()].filter((product) => product.freeShipping).map((product) => product.Id),
    variantsByProduct,
  };
};

const updateOneFromDB = async (id, payload) => {
  const row = await LandingPage().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Landing page not found");
  const existing = row.get({ plain: true });
  await row.update(await normalizePayload({ ...existing, ...payload }));
  return row;
};

// Copies a page as an inactive draft so the copy never goes live by accident.
const duplicateIntoDB = async (id) => {
  const row = await LandingPage().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Landing page not found");
  const { Id, createdAt, updatedAt, deletedAt, ...data } = row.get({ plain: true });
  return LandingPage().create({ ...data, title: `${data.title} (Copy)`, status: false });
};

const deleteIdFromDB = async (id) => {
  const row = await LandingPage().findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Landing page not found");
  await row.destroy();
  return { deleted: true };
};

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getOneFromDB,
  getPublicOneFromDB,
  updateOneFromDB,
  duplicateIntoDB,
  deleteIdFromDB,
  getHeaderFromDB,
  getFooterFromDB,
};
