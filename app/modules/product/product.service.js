const { Op, where } = require("sequelize"); // Ensure Op is imported
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const {
  normalizeVariantOptions,
  variantOptionKey,
  getVariationOptions,
  variationSalePrice,
  variationRegularPrice,
} = require("../../../shared/productVariants");
const { ProductSearchableFields } = require("./product.constants");
const { erpOwnsStock } = require("../order/erpSync");
const Product = db.product;
const Variation = db.variation;
const SupplierHistory = db.supplierHistory;
const InventoryMaster = db.inventoryMaster;

const productNameSyncModels = [
  { Model: db.purchaseRequisition, reference: "product" },
  { Model: db.receivedProduct, reference: "product" },
  { Model: db.purchaseReturnProduct, reference: "inventory" },
  { Model: db.inTransitProduct, reference: "inventory" },
  { Model: db.returnProduct, reference: "inventory" },
  { Model: db.damageStock, reference: "product" },
  { Model: db.damageProduct, reference: "inventory" },
  { Model: db.damageRepair, reference: "damageStock" },
  { Model: db.damageReparingStock, reference: "product" },
  { Model: db.damageRepaired, reference: "repairingStock" },
];

const parseItems = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const hasAttribute = (Model, attribute) =>
  Boolean(Model?.rawAttributes?.[attribute]);

const optionalId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

const optionalPrice = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
};

// A variant image is one of the product images: an existing path, or "new:<i>" meaning
// the i-th file uploaded with this same request.
const resolveVariantImage = (ref, uploadedPaths = []) => {
  const value = String(ref || "").trim();
  if (!value) return null;
  const match = /^new:(\d+)$/.exec(value);
  if (match) return uploadedPaths[Number(match[1])] || null;
  return value.slice(0, 500);
};

// Validates the admin "variations" payload. Returns undefined when the field was not sent.
const parseVariationRows = (raw, uploadedPaths = []) => {
  if (raw === undefined) return undefined;
  let rows = raw;
  if (typeof raw === "string") {
    try { rows = JSON.parse(raw); } catch { throw new ApiError(400, "Invalid variations payload"); }
  }
  if (!Array.isArray(rows)) throw new ApiError(400, "Invalid variations payload");

  const seen = new Set();
  return rows.map((v = {}) => {
    const options = normalizeVariantOptions(v.options);
    const preOrder = v.preOrder === true || v.preOrder === "true" || v.preOrder === 1 || v.preOrder === "1";
    const stock = Math.floor(Number(v.stock) || 0);
    const key = variantOptionKey(options);
    if (seen.has(key)) {
      throw new ApiError(400, key ? `Duplicate variant: ${Object.values(options).join(" / ")}` : "Only one variant can have no options");
    }
    seen.add(key);
    return {
      Id:            optionalId(v.Id ?? v.id),
      options,
      colorId:       optionalId(v.colorId),
      colorImage:    resolveVariantImage(v.image ?? v.colorImage, uploadedPaths),
      attribute:     v.attribute || null,
      sku:           v.sku ? String(v.sku).trim() : null,
      availability:  v.availability === "out of stock" ? "out of stock" : "in stock",
      purchasePrice: optionalPrice(v.purchasePrice),
      oldPrice:      optionalPrice(v.oldPrice),
      newPrice:      optionalPrice(v.newPrice),
      // Pre-orders can push stock below zero; keep that owed quantity on save.
      stock:         preOrder ? stock : Math.max(0, stock),
      preOrder,
    };
  });
};

// Updates variations in place (keeping their Ids stable for carts and orders),
// creates new ones and soft-deletes the ones that were removed.
// With the ERP connected, stock comes only from the ERP sync, never the form.
const syncProductVariations = async (productId, rows, transaction) => {
  const existing = await Variation.findAll({ where: { productId }, transaction });
  const existingIds = new Set(existing.map((row) => Number(row.Id)));
  const keptIds = new Set();
  const lockStock = erpOwnsStock();

  for (const { Id, ...values } of rows) {
    if (Id && existingIds.has(Id)) {
      keptIds.add(Id);
      const { stock, ...rest } = values;
      await Variation.update(lockStock ? rest : values, { where: { Id, productId }, transaction });
    } else {
      await Variation.create({ ...values, ...(lockStock ? { stock: 0 } : {}), productId }, { transaction });
    }
  }

  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length) {
    await Variation.destroy({ where: { productId, Id: { [Op.in]: removedIds } }, transaction });
  }
};

const createSupplierPaymentIfNeeded = async ({
  purchaseEnabled,
  supplierId,
  payAmount,
  purchaseDate,
  productName,
  transaction,
}) => {
  const enabled = purchaseEnabled === true || purchaseEnabled === "true" || purchaseEnabled === "1" || purchaseEnabled === 1;
  const resolvedSupplierId = optionalId(supplierId);
  const amount = Number(payAmount || 0);
  if (!enabled || !SupplierHistory || !resolvedSupplierId || !amount) return null;

  return SupplierHistory.create({
    supplierId: resolvedSupplierId,
    amount,
    status: "Paid",
    date: String(purchaseDate || new Date().toISOString()).slice(0, 10),
    file: productName ? `Product purchase: ${productName}` : null,
  }, transaction ? { transaction } : undefined);
};

const buildJoinedName = (items = []) =>
  items
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean)
    .join(", ");

const renameItemsByReference = (
  items = [],
  referenceIds = [],
  nextName,
  previousNames = [],
) => {
  const idSet = new Set(referenceIds.map((item) => Number(item)));
  const previousNameSet = new Set(
    previousNames.map((item) => String(item || "").trim()).filter(Boolean),
  );
  let changed = false;

  const renamedItems = items.map((item) => {
    const itemProductId = Number(item?.productId ?? item?.receivedId);
    const itemName = String(item?.name || "").trim();
    if (!idSet.has(itemProductId) && !previousNameSet.has(itemName)) {
      return item;
    }

    changed = true;
    return {
      ...item,
      name: nextName,
    };
  });

  return { changed, items: renamedItems };
};

const syncNameRows = async (
  Model,
  referenceIds,
  nextName,
  transaction,
  previousNames = [],
) => {
  if (!Model) return;

  const previousNameSet = new Set(
    previousNames.map((item) => String(item || "").trim()).filter(Boolean),
  );
  if (!referenceIds.length && !previousNameSet.size) return;

  const attributes = ["Id", "name"];
  if (hasAttribute(Model, "productId")) attributes.push("productId");
  if (hasAttribute(Model, "items")) attributes.push("items");

  const rows = await Model.findAll({
    attributes,
    transaction,
    paranoid: false,
  });

  await Promise.all(
    rows.map(async (row) => {
      const rowProductId = Number(row.productId);
      const items = parseItems(row.items);
      const data = {};

      if (items.length) {
        const renamed = renameItemsByReference(
          items,
          referenceIds,
          nextName,
          previousNames,
        );
        if (!renamed.changed) return;

        data.items = renamed.items;
        data.name = buildJoinedName(renamed.items) || nextName;
      } else if (
        referenceIds.includes(rowProductId) ||
        previousNameSet.has(String(row.name || "").trim())
      ) {
        data.name = nextName;
      } else {
        return;
      }

      await row.update(data, { transaction });
    }),
  );
};

const syncProductNameReferences = async (
  productId,
  nextName,
  transaction,
  previousNames = [],
) => {
  const fetchIds = async (Model, where) => {
    if (!Model) return [];
    const rows = await Model.findAll({ attributes: ["Id"], where, transaction, paranoid: false });
    return rows.map((row) => Number(row.Id));
  };

  const [inventoryIds, damageStockIds, repairingStockIds] = await Promise.all([
    fetchIds(InventoryMaster, { productId }),
    fetchIds(db.damageStock, { productId }),
    fetchIds(db.damageReparingStock, { productId }),
  ]);

  if (InventoryMaster) {
    await InventoryMaster.update(
      { name: nextName },
      { where: { productId }, transaction, paranoid: false },
    );
  }

  await Promise.all(
    productNameSyncModels.map(({ Model, reference }) => {
      const referenceIds = {
        damageStock: damageStockIds,
        inventory: inventoryIds,
        product: [productId],
        repairingStock: repairingStockIds,
      }[reference];

      return syncNameRows(
        Model,
        referenceIds || [],
        nextName,
        transaction,
        previousNames,
      );
    }),
  );
};

const insertIntoDB = async (data, files = []) => {
  const {
    name, slug, sku,
    categoryId, subcategoryId, childcategoryId, brandId,
    productVideo, advanceAmount, stockAlert, rackNo,
    description, shortDescription,
    metaTitle, metaKeyword, metaDescription,
    giftTitle, giftPrice,
    bestDeals, freeShipping, flashSale, status,
    variations: variationsRaw,
    purchaseEnabled, supplierId, payAmount, purchaseDate,
  } = data;

  // collect uploaded image paths
  const imagePaths = files.map(f => f.filename || f.path);

  const payload = {
    name,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    sku:             sku             || null,
    categoryId:      categoryId      ? Number(categoryId)      : null,
    subcategoryId:   subcategoryId   ? Number(subcategoryId)   : null,
    childcategoryId: childcategoryId ? Number(childcategoryId) : null,
    brandId:         brandId         ? Number(brandId)         : null,
    productVideo:    productVideo    || null,
    advanceAmount:   advanceAmount   ? Number(advanceAmount)   : null,
    stockAlert:      stockAlert      ? Number(stockAlert)      : null,
    rackNo:          rackNo          ? String(rackNo).trim()   : null,
    description:     description     || null,
    shortDescription:shortDescription|| null,
    metaTitle:       metaTitle       || null,
    metaKeyword:     metaKeyword     || null,
    metaDescription: metaDescription || null,
    giftTitle:       giftTitle       || null,
    giftPrice:       giftPrice       ? Number(giftPrice)       : null,
    images:          imagePaths.length ? imagePaths : null,
    bestDeals:       bestDeals === 'true'    || bestDeals === true,
    freeShipping:    freeShipping === 'true' || freeShipping === true,
    flashSale:       flashSale === 'true'    || flashSale === true,
    status:          status || "Active",
    date:            new Date().toISOString().slice(0, 10),
  };

  const variationRows = parseVariationRows(variationsRaw, imagePaths);
  const product = await Product.create(payload);

  if (variationRows?.length) {
    await syncProductVariations(product.Id, variationRows);
  }

  await createSupplierPaymentIfNeeded({
    purchaseEnabled,
    supplierId,
    payAmount,
    purchaseDate,
    productName: product.name,
  });

  return product;
};

// Fields a copy must not share with the original product or variation.
const PRODUCT_COPY_OMIT = ["Id", "createdAt", "updatedAt", "deletedAt", "stockId", "sku"];
const VARIATION_COPY_OMIT = ["Id", "productId", "createdAt", "updatedAt", "deletedAt", "sku"];

// JSON columns come back from the database as text; writing that text into a
// new row would store it as one quoted string instead of the array/object.
const decodeJsonColumns = (Model, row) => {
  const decoded = { ...row };
  Object.entries(Model.rawAttributes).forEach(([field, attribute]) => {
    if (attribute.type?.key !== "JSON" || typeof decoded[field] !== "string") return;
    try {
      decoded[field] = JSON.parse(decoded[field]);
    } catch {
      // Not valid JSON text; keep the value as it is.
    }
  });
  return decoded;
};

const omitFields = (row, fields) => {
  const copy = { ...row };
  fields.forEach((field) => delete copy[field]);
  return copy;
};

// Copies a product with all its variations. The copy starts Inactive with no
// stock or SKU, so it stays off the website until it's reviewed and activated.
const duplicateProduct = async (id) => {
  const original = await Product.findByPk(id, {
    include: [{ model: Variation, as: "variations" }],
  });
  if (!original) throw new ApiError(404, "Product not found");
  const plain = original.get({ plain: true });

  return db.sequelize.transaction(async (transaction) => {
    const copy = await Product.create(
      {
        ...omitFields(decodeJsonColumns(Product, plain), [...PRODUCT_COPY_OMIT, "variations"]),
        name: `${plain.name} (Copy)`,
        slug: plain.slug ? `${plain.slug}-copy-${Date.now().toString(36)}` : null,
        status: "Inactive",
        date: new Date().toISOString().slice(0, 10),
      },
      { transaction },
    );

    const variations = (plain.variations || []).filter((variation) => !variation.deletedAt);
    if (variations.length) {
      await Variation.bulkCreate(
        variations.map((variation) => ({
          ...omitFields(decodeJsonColumns(Variation, variation), VARIATION_COPY_OMIT),
          productId: copy.Id,
          stock: 0,
        })),
        { transaction },
      );
    }

    return copy;
  });
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);

  const { searchTerm, startDate, endDate, ...otherFilters } = filters;

  const andConditions = [];

  // ✅ Search by product name or SKU/barcode. MySQL uses LIKE.
  if (searchTerm && searchTerm.trim()) {
    andConditions.push({
      [Op.or]: ProductSearchableFields.map((field) => ({
        [field]: { [Op.like]: `%${searchTerm.trim()}%` },
      })),
    });
  }

  // ✅ Exact filters (e.g. name)
  if (Object.keys(otherFilters).length) {
    andConditions.push(
      ...Object.entries(otherFilters).map(([key, value]) => ({
        [key]: { [Op.eq]: value },
      })),
    );
  }

  // ✅ Date range filter (createdAt)
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    andConditions.push({
      date: { [Op.between]: [start, end] },
    });
  }

  // ✅ Exclude soft deleted records
  andConditions.push({
    deletedAt: { [Op.is]: null }, // Only include records with deletedAt as null (not deleted)
  });

  const whereConditions = andConditions.length
    ? { [Op.and]: andConditions }
    : {};

  const result = await Product.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    include: [
      {
        model: Variation,
        as: "variations",
      },
    ],
    paranoid: true,
    order: (() => {
      const ALLOWED_SORT_COLUMNS = new Set([
        "createdAt", "updatedAt", "name", "price", "stock",
      ]);
      const ALLOWED_SORT_ORDERS = new Set(["ASC", "DESC"]);
      const col = options.sortBy;
      const ord = (options.sortOrder || "").toUpperCase();
      if (col && ALLOWED_SORT_COLUMNS.has(col) && ALLOWED_SORT_ORDERS.has(ord)) {
        return [[col, ord]];
      }
      return [["createdAt", "DESC"]];
    })(),
  });

  const count = await Product.count({ where: whereConditions });

  return {
    meta: { count, page, limit },
    data: result,
  };
};

const getDataById = async (id) => {
  const result = await Product.findOne({
    where: {
      stockId: id,
    },
    include: [
      {
        model: db.variation,
        as: "variations",
      },
    ],
  });

  return result;
};

const deleteIdFromDB = async (id) => {
  const result = await Product.destroy({
    where: {
      Id: id,
    },
  });

  return result;
};

const updateOneFromDB = async (id, payload, files = []) => {
  const {
    name, slug, sku,
    categoryId, subcategoryId, childcategoryId, brandId,
    productVideo, advanceAmount, stockAlert, rackNo,
    description, shortDescription,
    metaTitle, metaKeyword, metaDescription,
    giftTitle, giftPrice,
    bestDeals, freeShipping, flashSale, status,
    variations: variationsRaw,
    keptImages: keptImagesRaw,
    purchaseEnabled, supplierId, payAmount, purchaseDate,
  } = payload;

  const variationRows = parseVariationRows(variationsRaw, files.map(f => f.filename || f.path));

  return db.sequelize.transaction(async (transaction) => {
    const existingProduct = await Product.findOne({ where: { Id: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!existingProduct) throw new ApiError(404, "Product not found");

    // merge kept + new image filenames
    let keptImages = [];
    try { keptImages = typeof keptImagesRaw === 'string' ? JSON.parse(keptImagesRaw) : (keptImagesRaw || []); } catch { keptImages = []; }
    const newImagePaths = files.map(f => f.filename || f.path);
    const mergedImages = [...keptImages, ...newImagePaths];

    const data = {
      name,
      slug: slug || String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''),
      sku:             sku             || null,
      categoryId:      categoryId      ? Number(categoryId)      : null,
      subcategoryId:   subcategoryId   ? Number(subcategoryId)   : null,
      childcategoryId: childcategoryId ? Number(childcategoryId) : null,
      brandId:         brandId         ? Number(brandId)         : null,
      productVideo:    productVideo    || null,
      advanceAmount:   advanceAmount   ? Number(advanceAmount)   : null,
      stockAlert:      stockAlert      ? Number(stockAlert)      : null,
      rackNo:          rackNo          ? String(rackNo).trim()   : null,
      description:     description     || null,
      shortDescription:shortDescription|| null,
      metaTitle:       metaTitle       || null,
      metaKeyword:     metaKeyword     || null,
      metaDescription: metaDescription || null,
      giftTitle:       giftTitle       || null,
      giftPrice:       giftPrice       ? Number(giftPrice)       : null,
      images:          mergedImages.length ? mergedImages : null,
      bestDeals:       bestDeals === 'true'    || bestDeals === true,
      freeShipping:    freeShipping === 'true' || freeShipping === true,
      flashSale:       flashSale === 'true'    || flashSale === true,
      status:          status || "Active",
    };

    await Product.update(data, { where: { Id: id }, transaction });

    const nextName = String(name || "").trim();
    const oldName  = String(existingProduct.name || "").trim();
    if (nextName) {
      await syncProductNameReferences(Number(id), nextName, transaction, oldName && oldName !== nextName ? [oldName] : []);
    }

    if (variationRows !== undefined) {
      await syncProductVariations(Number(id), variationRows, transaction);
    }

    await createSupplierPaymentIfNeeded({
      purchaseEnabled,
      supplierId,
      payAmount,
      purchaseDate,
      productName: name || existingProduct.name,
      transaction,
    });

    return { id, updated: true };
  });
};

const getAllFromDBWithoutQuery = async () => {
  const result = await Product.findAll({
    paranoid: true,
    order: [["createdAt", "DESC"]],
  });

  return result;
};

const getReceivedDataById = async (id) => {
  const result = await Product.findOne({
    where: {
      Id: id,
    },
    include: [
      {
        model: db.variation,
        as: "variations",
      },
    ],
  });

  return result;
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getNameMap = async (Model, ids) => {
  const cleanIds = [...new Set(ids.filter(Boolean).map((id) => Number(id)))];
  if (!Model || !cleanIds.length) return new Map();
  const rows = await Model.findAll({
    attributes: ["Id", "name"],
    where: { Id: { [Op.in]: cleanIds } },
    paranoid: true,
    raw: true,
  });
  return new Map(rows.map((row) => [Number(row.Id), row.name]));
};

const uniqueList = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
};

const toStorefrontProduct = (product, maps = {}) => {
  const plain = product.toJSON ? product.toJSON() : product;
  const variations = (plain.variations || [])
    .slice()
    .sort((a, b) => Number(a.Id) - Number(b.Id));
  const images = uniqueList([
    plain.file,
    ...parseJsonArray(plain.images),
    ...parseJsonArray(plain.gallery),
  ].filter(Boolean));

  const variants = variations.map((variation) => {
    const colorName = maps.colors?.get(Number(variation.colorId)) || null;
    const stock = Math.max(0, Number(variation.stock || 0));
    const preOrder = Boolean(variation.preOrder);
    return {
      id: variation.Id,
      options: getVariationOptions(variation, colorName),
      sku: variation.sku || null,
      image: variation.colorImage || null,
      oldPrice: variationRegularPrice(variation),
      newPrice: variationSalePrice(variation),
      stock,
      availability: variation.availability || null,
      preOrder,
      inStock: variation.availability !== "out of stock" && (preOrder || stock > 0),
    };
  });

  // Option groups in first-seen order, e.g. [{ name: "Volume", values: ["3ml", "6ml"] }]
  const optionGroups = new Map();
  variants.forEach(({ options }) => {
    Object.entries(options).forEach(([name, value]) => {
      if (!optionGroups.has(name)) optionGroups.set(name, []);
      const values = optionGroups.get(name);
      if (!values.includes(value)) values.push(value);
    });
  });

  const priced = variants.filter((variant) => variant.newPrice > 0);
  const available = priced.filter((variant) => variant.inStock);
  // Default price shown on cards: the cheapest in-stock variant.
  const defaultVariant = (available.length ? available : priced)
    .reduce((best, variant) => (!best || variant.newPrice < best.newPrice ? variant : best), null);
  const newPrice = defaultVariant?.newPrice || 0;
  const oldPrice = defaultVariant?.oldPrice || newPrice;
  const discount = oldPrice > newPrice && newPrice > 0
    ? Math.round(((oldPrice - newPrice) / oldPrice) * 100)
    : 0;
  const salePrices = priced.map((variant) => variant.newPrice);
  const stock = variants.reduce((sum, variant) => sum + (variant.inStock ? variant.stock : 0), 0);
  const preOrder = variants.some((variant) => variant.preOrder && variant.inStock);

  return {
    Id: plain.Id,
    name: plain.name,
    slug: plain.slug || null,
    category: maps.categories?.get(Number(plain.categoryId)) || null,
    categoryId: plain.categoryId,
    subCategory: maps.subcategories?.get(Number(plain.subcategoryId)) || null,
    subCategoryId: plain.subcategoryId,
    childCategory: maps.childcategories?.get(Number(plain.childcategoryId)) || null,
    childCategoryId: plain.childcategoryId,
    sale_price: newPrice,
    original_price: oldPrice,
    price_min: salePrices.length ? Math.min(...salePrices) : newPrice,
    price_max: salePrices.length ? Math.max(...salePrices) : newPrice,
    discount,
    quantity: stock,
    file: images[0] || null,
    gallery: images,
    description: plain.description || null,
    shortDescription: plain.shortDescription || null,
    features: plain.shortDescription ? [plain.shortDescription] : parseJsonArray(plain.features),
    options: [...optionGroups].map(([name, values]) => ({ name, values })),
    variants,
    sku: plain.sku,
    freeShipping: Boolean(plain.freeShipping),
    bestDeals: Boolean(plain.bestDeals),
    flashSale: Boolean(plain.flashSale),
    inStock: stock > 0 || preOrder,
    preOrder,
    status: plain.status,
  };
};

const idsByName = async (Model, name, extraWhere = {}) => {
  const rows = await Model.findAll({
    attributes: ["Id"],
    where: { name, ...extraWhere },
    paranoid: true,
    raw: true,
  });
  return rows.map((row) => row.Id);
};

// Storefront menu links identify categories by name (?menu=&sub=&child=).
// Returns product where-conditions, or null when a named level doesn't exist.
const storefrontCategoryConditions = async (options) => {
  const category = String(options.category || "").trim();
  const subCategory = String(options.subCategory || "").trim();
  const childCategory = String(options.childCategory || "").trim();
  if (!category) return [];

  const categoryIds = await idsByName(db.category, category);
  if (!categoryIds.length) return null;
  const conditions = [{ categoryId: { [Op.in]: categoryIds } }];
  if (!subCategory) return conditions;

  const subcategoryIds = await idsByName(db.subcategory, subCategory, {
    categoryId: { [Op.in]: categoryIds },
  });
  if (!subcategoryIds.length) return null;
  conditions.push({ subcategoryId: { [Op.in]: subcategoryIds } });
  if (!childCategory) return conditions;

  const childcategoryIds = await idsByName(db.childcategory, childCategory, {
    subcategoryId: { [Op.in]: subcategoryIds },
  });
  if (!childcategoryIds.length) return null;
  conditions.push({ childcategoryId: { [Op.in]: childcategoryIds } });
  return conditions;
};

const getStorefrontProducts = async (options = {}) => {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
  const skip = (page - 1) * limit;
  const searchTerm = String(options.searchTerm || "").trim();

  const categoryConditions = await storefrontCategoryConditions(options);
  if (!categoryConditions) return { products: [], meta: { total: 0, page, limit } };

  const andConditions = [{ status: { [Op.ne]: "Inactive" } }, ...categoryConditions];
  if (searchTerm) {
    andConditions.push({
      [Op.or]: ProductSearchableFields.map((field) => ({
        [field]: { [Op.like]: `%${searchTerm}%` },
      })),
    });
  }
  const whereConditions = { [Op.and]: andConditions };

  const [total, products] = await Promise.all([
    Product.count({ where: whereConditions, paranoid: true }),
    Product.findAll({
      where: whereConditions,
      include: [{ model: Variation, as: "variations" }],
      paranoid: true,
      order: [["createdAt", "DESC"]],
      limit,
      offset: skip,
    }),
  ]);

  const variationColorIds = products.flatMap((product) =>
    (product.variations || []).map((variation) => variation.colorId),
  );

  const [categories, subcategories, childcategories, colors] = await Promise.all([
    getNameMap(db.category, products.map((product) => product.categoryId)),
    getNameMap(db.subcategory, products.map((product) => product.subcategoryId)),
    getNameMap(db.childcategory, products.map((product) => product.childcategoryId)),
    getNameMap(db.color, variationColorIds),
  ]);

  return {
    products: products.map((product) =>
      toStorefrontProduct(product, { categories, subcategories, childcategories, colors }),
    ),
    meta: { total, page, limit },
  };
};

const getStorefrontProductById = async (id) => {
  const product = await Product.findOne({
    where: { Id: id, status: { [Op.ne]: "Inactive" } },
    include: [{ model: Variation, as: "variations" }],
    paranoid: true,
  });
  if (!product) return null;

  const variationColorIds = (product.variations || []).map((variation) => variation.colorId);
  const [categories, subcategories, childcategories, colors] = await Promise.all([
    getNameMap(db.category, [product.categoryId]),
    getNameMap(db.subcategory, [product.subcategoryId]),
    getNameMap(db.childcategory, [product.childcategoryId]),
    getNameMap(db.color, variationColorIds),
  ]);

  return toStorefrontProduct(product, { categories, subcategories, childcategories, colors });
};

// Products ordered most (by quantity) in the last BEST_SELLING_DAYS days, topped up with
// "Best Deals" and then the newest products so the homepage row is never empty.
const BEST_SELLING_DAYS = 90;
const BEST_SELLING_ORDER_LIMIT = 5000;
const BEST_SELLING_CACHE_MS = 10 * 60 * 1000;
const NOT_SOLD_STATUSES = ["incomplete", "cancelled", "returned", "return_received"];
let bestSellingCache = { at: 0, ids: [] };

const parseOrderItems = (note) => {
  try {
    const meta = JSON.parse(note || "{}");
    return Array.isArray(meta?.items) ? meta.items : [];
  } catch {
    return [];
  }
};

const getBestSellingIds = async () => {
  if (Date.now() - bestSellingCache.at < BEST_SELLING_CACHE_MS) return bestSellingCache.ids;
  const since = new Date(Date.now() - BEST_SELLING_DAYS * 24 * 60 * 60 * 1000);
  const orders = await db.order.findAll({
    attributes: ["note"],
    where: { createdAt: { [Op.gte]: since }, status: { [Op.notIn]: NOT_SOLD_STATUSES } },
    order: [["Id", "DESC"]],
    limit: BEST_SELLING_ORDER_LIMIT,
    raw: true,
  });
  const sold = new Map();
  orders.forEach((order) => parseOrderItems(order.note).forEach((item) => {
    const productId = Number(item?.id ?? item?.productId);
    const qty = Number(item?.qty) || 0;
    if (productId > 0 && qty > 0) sold.set(productId, (sold.get(productId) || 0) + qty);
  }));
  const ids = [...sold].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  bestSellingCache = { at: Date.now(), ids };
  return ids;
};

const getBestSellingProducts = async (options = {}) => {
  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 30);
  const soldIds = (await getBestSellingIds()).slice(0, limit * 2);
  const active = { status: { [Op.ne]: "Inactive" } };
  const include = [{ model: Variation, as: "variations" }];

  const sold = soldIds.length
    ? await Product.findAll({ where: { ...active, Id: { [Op.in]: soldIds } }, include, paranoid: true })
    : [];
  const rank = new Map(soldIds.map((id, index) => [id, index]));
  let products = sold.sort((a, b) => rank.get(Number(a.Id)) - rank.get(Number(b.Id)));

  if (products.length < limit * 2) {
    const fill = await Product.findAll({
      where: { ...active, Id: { [Op.notIn]: products.map((product) => product.Id).concat(0) } },
      include,
      paranoid: true,
      order: [["bestDeals", "DESC"], ["createdAt", "DESC"]],
      // Extra rows cover unpriced products dropped below.
      limit: limit * 2 - products.length,
    });
    products = products.concat(fill);
  }

  const [categories, subcategories, childcategories, colors] = await Promise.all([
    getNameMap(db.category, products.map((product) => product.categoryId)),
    getNameMap(db.subcategory, products.map((product) => product.subcategoryId)),
    getNameMap(db.childcategory, products.map((product) => product.childcategoryId)),
    getNameMap(db.color, products.flatMap((product) => (product.variations || []).map((v) => v.colorId))),
  ]);
  return products
    .map((product) => toStorefrontProduct(product, { categories, subcategories, childcategories, colors }))
    .filter((product) => product.sale_price > 0)
    .slice(0, limit);
};

const ProductService = {
  getAllFromDB,
  insertIntoDB,
  duplicateProduct,
  deleteIdFromDB,
  updateOneFromDB,
  getDataById,
  getReceivedDataById,
  getStorefrontProducts,
  getStorefrontProductById,
  getBestSellingProducts,
  getAllFromDBWithoutQuery,
};

module.exports = ProductService;
