// Shared variant helpers used by product (admin + storefront) and order pricing.

const MAX_OPTION_LENGTH = 100;

const parseJsonValue = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const cleanText = (value) => String(value ?? "").trim().slice(0, MAX_OPTION_LENGTH);

// { "Volume": " 6ml ", "": "x", "Color": "" } -> { "Volume": "6ml" }  (null when empty)
const normalizeVariantOptions = (raw) => {
  const value = parseJsonValue(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  Object.entries(value).forEach(([name, optionValue]) => {
    const key = cleanText(name);
    const text = cleanText(optionValue);
    if (key && text) result[key] = text;
  });
  return Object.keys(result).length ? result : null;
};

// Order-independent identity of an option combination.
const variantOptionKey = (options) =>
  Object.keys(options || {})
    .sort()
    .map((name) => `${name.toLowerCase()}=${String(options[name]).toLowerCase()}`)
    .join("|");

// Options for a stored variation, falling back to the legacy colorId/attribute columns.
const getVariationOptions = (variation = {}, colorName = null) => {
  const options = normalizeVariantOptions(variation.options);
  if (options) return options;
  const legacy = {};
  if (colorName) legacy.Color = colorName;
  if (variation.attribute) legacy.Option = cleanText(variation.attribute);
  return Object.keys(legacy).length ? legacy : {};
};

const variationSalePrice = (variation = {}) =>
  Number(variation.newPrice || variation.oldPrice || variation.purchasePrice || 0);

const variationRegularPrice = (variation = {}) =>
  Number(variation.oldPrice || variation.newPrice || variation.purchasePrice || 0);

const isVariationAvailable = (variation = {}, qty = 1) =>
  variation.availability !== "out of stock" &&
  (Boolean(variation.preOrder) || Number(variation.stock || 0) >= qty);

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const WEIGHT_PATTERN = /(\d+(?:\.\d+)?)\s*(kgs?|kilo(?:grams?)?|কেজি|grams?|gms?|g|গ্রাম)(?![a-z])/i;

// Nominal weight of a variant from its option text, e.g. { Weight: "1 kg" } -> { amount: 1, unit: "kg" }
// or "500 gm" -> { amount: 500, unit: "gm" }. null when no option names a weight.
const parseVariantWeight = (options = {}) => {
  for (const value of Object.values(options || {})) {
    const text = String(value).replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
    const match = text.match(WEIGHT_PATTERN);
    if (!match) continue;
    const amount = Number(match[1]);
    if (!(amount > 0)) continue;
    const unit = /^(kg|kilo|কেজি)/i.test(match[2]) ? "kg" : "gm";
    return { amount, unit };
  }
  return null;
};

const variantLabel = (options = {}) =>
  Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(", ");

module.exports = {
  normalizeVariantOptions,
  variantOptionKey,
  getVariationOptions,
  variationSalePrice,
  variationRegularPrice,
  isVariationAvailable,
  variantLabel,
  parseVariantWeight,
};
