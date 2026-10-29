const { Op } = require("sequelize");
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const {
  getVariationOptions,
  variationSalePrice,
  variationRegularPrice,
  isVariationAvailable,
  variantLabel,
} = require("../../../shared/productVariants");

const ComboOffer = db.comboOffer;
const MAX_ITEMS = 50;
const MAX_ITEM_QTY = 1000;

const toMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// [{ productId, variantId, qty }], one line per variant (repeated variants are merged).
const normalizeItems = (raw) => {
  const lines = new Map();
  parseArray(raw).forEach((item) => {
    const productId = Number(item?.productId ?? item?.id);
    const variantId = Number(item?.variantId) || null;
    const qty = Math.min(Math.max(1, Math.floor(Number(item?.qty) || 1)), MAX_ITEM_QTY);
    if (!(productId > 0)) return;
    const key = `${productId}:${variantId || ""}`;
    const current = lines.get(key);
    lines.set(key, { productId, variantId, qty: current ? current.qty + qty : qty });
  });
  return [...lines.values()].slice(0, MAX_ITEMS);
};

const normalizeStatus = (value, fallback = "Active") => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === false || String(value).toLowerCase() === "inactive" ? "Inactive" : "Active";
};

const normalizePayload = (payload = {}, current = {}) => {
  const items = payload.items !== undefined ? normalizeItems(payload.items) : parseArray(current.items);
  const regularPrice = toMoney(payload.regularPrice ?? current.regularPrice);
  const discount = Math.min(toMoney(payload.discount ?? current.discount), regularPrice);
  const pricesSent = payload.regularPrice !== undefined || payload.discount !== undefined;
  let offerPrice = Math.max(0, regularPrice - discount);
  if (payload.offerPrice !== undefined && payload.offerPrice !== "") offerPrice = toMoney(payload.offerPrice);
  else if (!pricesSent && current.offerPrice !== undefined) offerPrice = toMoney(current.offerPrice);

  const data = {
    title: String(payload.title ?? current.title ?? "").trim(),
    image: payload.image !== undefined ? payload.image || null : current.image ?? null,
    description: payload.description !== undefined ? payload.description || null : current.description ?? null,
    items,
    regularPrice,
    discount,
    offerPrice,
    sortOrder: Number(payload.sortOrder ?? current.sortOrder ?? 0) || 0,
    status: normalizeStatus(payload.status, current.status || "Active"),
  };

  if (!data.title) throw new ApiError(400, "Combo offer title is required");
  if (data.status === "Active" && !data.items.length) {
    throw new ApiError(400, "Combo offer-এ অন্তত একটি পণ্য যোগ করুন");
  }
  if (data.status === "Active" && !(data.offerPrice > 0)) {
    throw new ApiError(400, "Offer price সেট করুন");
  }
  return data;
};

const loadProducts = async (ids) => {
  const cleanIds = [...new Set(ids.map(Number).filter((id) => id > 0))];
  if (!cleanIds.length) return new Map();
  const products = await db.product.findAll({
    where: { Id: { [Op.in]: cleanIds } },
    include: [{ model: db.variation, as: "variations" }],
  });
  return new Map(products.map((product) => [Number(product.Id), product]));
};

const productImage = (product) => {
  const images = parseArray(product.images);
  return product.file || images[0] || parseArray(product.gallery)[0] || null;
};

// A product with no chosen variant falls back to its only variation.
const pickVariation = (product, variantId) => {
  const variations = product.variations || [];
  if (variantId) return variations.find((variation) => Number(variation.Id) === Number(variantId)) || null;
  return variations.length === 1 ? variations[0] : null;
};

// Stored item lines -> lines with the product name, variant, image, prices and stock.
const resolveItems = (items, products) =>
  parseArray(items).map((item) => {
    const product = products.get(Number(item.productId));
    const variation = product ? pickVariation(product, item.variantId) : null;
    const options = variation ? getVariationOptions(variation) : {};
    const available = Boolean(product && variation && product.status !== "Inactive");
    const qty = Number(item.qty) || 1;
    return {
      productId: Number(item.productId),
      variantId: variation ? variation.Id : item.variantId || null,
      qty,
      name: product?.name || "Unavailable product",
      slug: product?.slug || null,
      image: variation?.colorImage || (product ? productImage(product) : null),
      options,
      variant: variantLabel(options) || null,
      price: variation ? variationSalePrice(variation) : 0,
      regularPrice: variation ? variationRegularPrice(variation) : 0,
      freeShipping: Boolean(product?.freeShipping),
      available,
      inStock: available && isVariationAvailable(variation, qty),
    };
  });

const withResolvedItems = async (rows) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const products = await loadProducts(
    list.flatMap((row) => parseArray(row.items).map((item) => item.productId)),
  );
  const resolved = list.map((row) => {
    const plain = row.toJSON ? row.toJSON() : row;
    const items = resolveItems(plain.items, products);
    return {
      ...plain,
      regularPrice: Number(plain.regularPrice || 0),
      discount: Number(plain.discount || 0),
      offerPrice: Number(plain.offerPrice || 0),
      items,
      inStock: items.length > 0 && items.every((item) => item.inStock),
    };
  });
  return Array.isArray(rows) ? resolved : resolved[0];
};

const insertIntoDB = async (data) => ComboOffer.create(normalizePayload(data));

const getAllFromDB = async (filters = {}, options = {}) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const where = {};
  if (filters.searchTerm) where.title = { [Op.like]: `%${filters.searchTerm}%` };
  if (filters.status) where.status = filters.status;

  const [count, rows] = await Promise.all([
    ComboOffer.count({ where }),
    ComboOffer.findAll({
      where,
      offset: skip,
      limit,
      order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
    }),
  ]);
  return { meta: { count, page, limit }, data: await withResolvedItems(rows) };
};

const getDataById = async (id) => {
  const row = await ComboOffer.findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Combo offer not found");
  return withResolvedItems(row);
};

const getPublicCombos = async () => {
  const rows = await ComboOffer.findAll({
    where: { status: "Active" },
    order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
  });
  return withResolvedItems(rows);
};

const getPublicComboById = async (id) => {
  const row = await ComboOffer.findOne({ where: { Id: id, status: "Active" } });
  return row ? withResolvedItems(row) : null;
};

const updateOneFromDB = async (id, payload) => {
  const row = await ComboOffer.findOne({ where: { Id: id } });
  if (!row) throw new ApiError(404, "Combo offer not found");
  await row.update(normalizePayload(payload, row.toJSON()));
  return row;
};

const deleteIdFromDB = async (id) => ComboOffer.destroy({ where: { Id: id } });

// Active combos by id, for order pricing.
const getActiveCombos = async (ids) => {
  const cleanIds = [...new Set(ids.map(Number).filter((id) => id > 0))];
  if (!cleanIds.length) return new Map();
  const rows = await ComboOffer.findAll({ where: { Id: { [Op.in]: cleanIds }, status: "Active" } });
  return new Map(rows.map((row) => [Number(row.Id), row]));
};

module.exports = {
  insertIntoDB,
  getAllFromDB,
  getDataById,
  getPublicCombos,
  getPublicComboById,
  updateOneFromDB,
  deleteIdFromDB,
  getActiveCombos,
  parseArray,
};
