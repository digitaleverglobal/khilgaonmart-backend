const parseMaybeJson = (value, fallback) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
};

const toNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const pickFirstValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const parseVariants = (value) => parseMaybeJson(value, []);

const buildVariantFromItem = (item = {}, source = item) => {
  const size = pickFirstValue(item.size, item.variantSize);
  const color = pickFirstValue(item.color, item.variantColor);

  if (size === undefined && color === undefined) return null;

  return {
    size,
    color,
    quantity: toNumber(source.quantity),
    purchase_price: toNumber(item.purchase_price),
    sale_price: toNumber(item.sale_price),
  };
};

const normalizeItemVariants = (item = {}, source = item) => {
  const variants = parseVariants(source.variants);
  if (variants.length) return variants;

  const variant = buildVariantFromItem(item, source);
  return variant ? [variant] : [];
};

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const sumVariantQuantities = (variants = []) =>
  variants.reduce((total, variant) => total + toNumber(variant.quantity), 0);

const getBulkItems = (body = {}) => {
  const items = parseMaybeJson(body.items, null);
  if (!items?.length) return null;

  const { items: _items, ...commonFields } = body;

  return items.map((item) => ({
    ...commonFields,
    ...item,
  }));
};

const insertBulkOrSingle = async (body, insertOne, file) => {
  const items = getBulkItems(body);

  if (!items) {
    return insertOne(body, file);
  }

  const results = [];
  for (const item of items) {
    results.push(await insertOne(item, file));
  }

  return results;
};

const getGroupedBulkItems = (body = {}, groupFields = []) => {
  const rawItems = parseMaybeJson(body.items, null);
  if (!rawItems?.length) return null;

  const { items: _items, ...commonFields } = body;

  const groups = new Map();

  rawItems.forEach((rawItem) => {
    const item = {
      ...commonFields,
      ...rawItem,
    };
    const variants = normalizeItemVariants(item, rawItem);
    const key = groupFields
      .map((field) => `${field}:${pickFirstValue(item[field], "")}`)
      .join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        ...item,
        quantity: 0,
        variants: [],
      });
    }

    const group = groups.get(key);
    group.quantity += hasValue(rawItem.quantity)
      ? toNumber(rawItem.quantity)
      : sumVariantQuantities(variants);
    group.variants = group.variants.concat(variants);

    const purchasePrice = pickFirstValue(item.purchase_price, group.purchase_price);
    const salePrice = pickFirstValue(item.sale_price, group.sale_price);

    if (purchasePrice !== undefined) group.purchase_price = purchasePrice;
    if (salePrice !== undefined) group.sale_price = salePrice;
  });

  if (groups.size === 1) {
    const [group] = groups.values();
    if (!group.quantity && hasValue(commonFields.quantity)) {
      group.quantity = toNumber(commonFields.quantity);
    }
  }

  return Array.from(groups.values());
};

const insertGroupedBulkOrSingle = async (body, insertOne, groupFields, file) => {
  const items = getGroupedBulkItems(body, groupFields);

  if (!items) {
    return insertOne(body, file);
  }

  const results = [];
  for (const item of items) {
    results.push(await insertOne(item, file));
  }

  return results;
};

module.exports = {
  getBulkItems,
  insertBulkOrSingle,
  getGroupedBulkItems,
  insertGroupedBulkOrSingle,
};
