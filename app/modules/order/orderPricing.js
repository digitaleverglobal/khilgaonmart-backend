const { Op } = require("sequelize");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const {
  getVariationOptions,
  variationSalePrice,
  variationRegularPrice,
  isVariationAvailable,
  variantLabel,
  parseVariantWeight,
} = require("../../../shared/productVariants");
const { getActiveCombos, parseArray } = require("../comboOffer/comboOffer.service");

const MAX_ITEM_QTY = 1000;
// Also the minimum: a lower charge in settings or on a landing page is raised to these.
const DEFAULT_DHAKA_CHARGE = 80;
const DEFAULT_OUTSIDE_DHAKA_CHARGE = 130;

const toQty = (value) => Math.min(Math.max(1, Math.floor(Number(value) || 1)), MAX_ITEM_QTY);

const toPositiveNumber = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
};

const toMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const parseObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// Mirrors buildProductOptions() in the storefront landing page so the server charges
// exactly the price the customer was shown.
const getLandingOptions = (page) => {
  const regularData = parseObject(page.regularData);
  const configured = Array.isArray(regularData.productOptions) ? regularData.productOptions : [];
  const options = configured
    .map((item) => {
      // Admin-priced variations of the linked product; the customer picks one.
      const variants = (Array.isArray(item.variants) ? item.variants : [])
        .map((variant) => ({
          variantId: Number(variant.variantId) || 0,
          label: String(variant.label || "").trim(),
          price: toPositiveNumber(variant.price, 0),
        }))
        .filter((variant) => variant.variantId > 0 && variant.price > 0);
      return {
        productId: item.productId || item.id || page.productId || page.Id,
        linkedProductId: item.productId || page.productId || null,
        name: String(item.name || page.product || page.title || "Landing Product"),
        price: toPositiveNumber(item.price, variants[0]?.price || toPositiveNumber(page.price, 1899)),
        variants,
      };
    })
    .filter((item) => item.name && item.price > 0);
  if (options.length) return options;

  return [{
    productId: page.productId || page.Id,
    linkedProductId: page.productId || null,
    name: page.product || page.title || "Product",
    price: toPositiveNumber(page.price, 0),
    variants: [],
  }];
};

// Mirrors getDeliveryChargeForDistrict() in the storefront shipping service.
const hasInsideDhakaText = (note) =>
  /ঢাকার\s*ভিতরে|ঢাকা\s*ভিতরে|inside\s*dhaka|in\s*dhaka/i.test(note);
const hasOutsideDhakaText = (note) =>
  /ঢাকার\s*বাইরে|ঢাকা\s*বাইরে|outside\s*dhaka|out\s*of\s*dhaka/i.test(note);

const chargeAmount = (charge) => {
  const amount = Number(charge?.amount);
  return charge && Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const getWebsiteDeliveryCharge = async (district) => {
  const isDhaka = String(district || "").trim().toLowerCase() === "dhaka";
  const minimum = isDhaka ? DEFAULT_DHAKA_CHARGE : DEFAULT_OUTSIDE_DHAKA_CHARGE;
  const charges = db.deliveryCharge
    ? await db.deliveryCharge.findAll({
        order: [["date", "DESC"], ["createdAt", "DESC"]],
        limit: 100,
        raw: true,
      })
    : [];
  const matcher = isDhaka ? hasInsideDhakaText : hasOutsideDhakaText;
  const matched = chargeAmount(charges.find((charge) => matcher(String(charge.note || ""))));
  if (matched !== null) return Math.max(matched, minimum);
  const fallback = chargeAmount(charges[isDhaka ? 0 : 1]);
  if (fallback !== null) return Math.max(fallback, minimum);
  return minimum;
};

// Delivery areas (Website Setting → Delivery Area) price delivery per district + area.
// Returns null while none are configured, so the older district charge still applies.
const resolveDeliveryArea = async (payload, strict) => {
  const areas = db.deliveryArea
    ? await db.deliveryArea.findAll({ where: { status: "Active" }, raw: true })
    : [];
  if (!areas.length) return null;

  const areaId = Number(payload.deliveryAreaId);
  const selected = areaId > 0 ? areas.find((area) => Number(area.Id) === areaId) : null;
  if (!selected) {
    if (strict) throw new ApiError(400, "জেলা ও এরিয়া নির্বাচন করুন");
    return { charge: 0, fields: {} };
  }

  const address = String(payload.customerAddress || "").trim();
  const mentionsArea = address.toLowerCase().includes(selected.area.toLowerCase());
  return {
    charge: chargeAmount({ amount: selected.charge }) ?? 0,
    fields: {
      deliveryAreaId: selected.Id,
      deliveryArea: selected.area,
      customerDistrict: selected.district,
      // Admin views, invoices and courier bookings show the address, so the area goes there too.
      customerAddress: !address || mentionsArea ? address || selected.area : `${address}, ${selected.area}`,
    },
  };
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

// Picks the variation an item refers to. Old carts carry no variantId, so a product
// with a single variation, or a legacy size/color match, is accepted too.
const findVariation = (product, item) => {
  const variations = product.variations || [];
  if (item.variantId) {
    return variations.find((variation) => Number(variation.Id) === Number(item.variantId)) || null;
  }
  if (variations.length === 1) return variations[0];
  const wanted = [item.size, item.color].filter(Boolean).map(String);
  if (!wanted.length) return null;
  const matches = variations.filter((variation) => {
    const values = Object.values(getVariationOptions(variation));
    return wanted.every((value) => values.includes(value));
  });
  return matches.length === 1 ? matches[0] : null;
};

const describeVariation = (variation) => {
  const options = getVariationOptions(variation);
  return { options, variant: variantLabel(options) || undefined };
};

// Chip text like the shop's: option values only, e.g. "0.5 kg" or "Red / XL".
const variationChipLabel = (variation) =>
  Object.values(getVariationOptions(variation)).join(" / ") || `#${variation.Id}`;

// A landing product's variations for the storefront chips: admin-priced ones when set,
// otherwise the linked product's own variations at their own prices. A product with a
// single variation keeps the landing price, so it shows just one chip.
const getLandingVariants = (option, product) => {
  const variations = product?.variations || [];
  const byId = new Map(variations.map((variation) => [Number(variation.Id), variation]));
  const describe = (variation) => ({
    image: variation?.colorImage || null,
    inStock: variation ? isVariationAvailable(variation, 1) : true,
  });
  if (option.variants.length) {
    return option.variants.map((variant) => ({ ...variant, ...describe(byId.get(variant.variantId)) }));
  }
  if (variations.length === 1) {
    return [{ variantId: Number(variations[0].Id), label: variationChipLabel(variations[0]), price: option.price, ...describe(variations[0]) }];
  }
  return variations
    .map((variation) => ({
      variantId: Number(variation.Id),
      label: variationChipLabel(variation),
      price: variationSalePrice(variation),
      originalPrice: variationRegularPrice(variation),
      ...describe(variation),
    }))
    .filter((variant) => variant.price > 0);
};

const priceLandingOrder = async (payload, landingPageId, strict) => {
  const page = await db.landingPage.findOne({ where: { Id: landingPageId } });
  if (!page) {
    if (strict) throw new ApiError(400, "Landing page not found");
    return payload;
  }
  const options = getLandingOptions(page);
  const products = await loadProducts(options.map((option) => option.linkedProductId).filter(Boolean));
  let allFreeShipping = payload.items.length > 0;

  const items = payload.items.map((item) => {
    const byId = options.filter((option) => Number(option.productId) === Number(item.id));
    const option = byId.find((candidate) => candidate.name === item.name) || byId[0] ||
      options.find((candidate) => candidate.name === item.name);
    if (!option) {
      if (strict) throw new ApiError(400, `"${item.name || "Product"}" এই অফারে পাওয়া যাচ্ছে না`);
      allFreeShipping = false;
      return item;
    }
    // Landing offers keep their own price; a single-variant product is still linked for stock.
    const product = option.linkedProductId && products.get(Number(option.linkedProductId));
    const freeShipping = Boolean(product?.freeShipping);
    if (!freeShipping) allFreeShipping = false;

    // Several variations (admin-priced or the product's own): the chosen one sets the price.
    const variants = product?.variations?.length === 1 ? [] : getLandingVariants(option, product);
    if (variants.length) {
      const chosen = variants.find((variant) => variant.variantId === Number(item.variantId));
      if (!chosen) {
        if (strict) throw new ApiError(400, `"${option.name}" এর variant বাছাই করুন`);
        return { ...item, name: option.name, qty: toQty(item.qty), freeShipping };
      }
      const variation = product?.variations?.find((entry) => Number(entry.Id) === chosen.variantId);
      if (strict && product && !variation) {
        throw new ApiError(400, `"${option.name}" এর এই variant আর পাওয়া যাচ্ছে না`);
      }
      if (strict && variation && !isVariationAvailable(variation, toQty(item.qty))) {
        throw new ApiError(400, `"${option.name}" এর পর্যাপ্ত stock নেই`);
      }
      return {
        ...item,
        variantId: chosen.variantId,
        name: option.name,
        ...(variation ? describeVariation(variation) : {}),
        variant: chosen.label || (variation ? describeVariation(variation).variant : undefined),
        price: chosen.price,
        qty: toQty(item.qty),
        freeShipping,
      };
    }

    const variation = product && product.variations?.length === 1 ? product.variations[0] : null;
    return {
      ...item,
      variantId: variation ? variation.Id : undefined,
      name: option.name,
      price: option.price,
      qty: toQty(item.qty),
      freeShipping,
    };
  });

  // Older landing forms send "inside"/"outside"; the checkout-style form sends a real
  // district (and delivery area), priced like the website checkout.
  const district = String(payload.customerDistrict || "").trim().toLowerCase();
  const legacyZone = district === "inside" || district === "outside";
  if (!legacyZone) {
    const delivery = await resolveDeliveryArea(payload, strict);
    if (delivery) {
      return { ...payload, ...delivery.fields, items, deliveryCharge: allFreeShipping ? 0 : delivery.charge };
    }
  }

  const regularData = parseObject(page.regularData);
  const outside = legacyZone ? district === "outside" : district !== "dhaka";
  let deliveryCharge = 0;
  if (!allFreeShipping) {
    deliveryCharge = outside
      ? Math.max(toPositiveNumber(regularData.deliveryOutside, 0), DEFAULT_OUTSIDE_DHAKA_CHARGE)
      : Math.max(toPositiveNumber(regularData.deliveryInside, 0), DEFAULT_DHAKA_CHARGE);
  }

  return { ...payload, items, deliveryCharge };
};

const productImage = (product, variation) => {
  if (variation?.colorImage) return variation.colorImage;
  return product.file || parseArray(product.images)[0] || null;
};

const priceWebsiteOrder = async (payload, strict) => {
  const isCombo = (item) => Number(item.comboOfferId) > 0;
  const combos = await getActiveCombos(payload.items.filter(isCombo).map((item) => item.comboOfferId));
  const comboLines = (combo) => parseArray(combo.items);
  const products = await loadProducts([
    ...payload.items.map((item) => item.id),
    ...[...combos.values()].flatMap((combo) => comboLines(combo).map((line) => line.productId)),
  ]);
  let allFreeShipping = payload.items.length > 0;
  let comboDiscount = 0;

  const priceLine = (item, extra = {}) => {
    const qty = toQty(item.qty);
    const product = products.get(Number(item.id));
    const fail = (message) => {
      if (strict) throw new ApiError(400, message);
      allFreeShipping = false;
      return { ...item, ...extra, qty };
    };
    if (!product || product.status === "Inactive") {
      return fail(`"${item.name || "Product"}" পণ্যটি আর পাওয়া যাচ্ছে না`);
    }

    const variation = findVariation(product, item);
    if (!variation) return fail(`"${product.name}" এর variant (size/color/ml) বাছাই করুন`);

    const price = variationSalePrice(variation);
    if (!(price > 0)) return fail(`"${product.name}" এর দাম সেট করা নেই`);
    if (strict && !isVariationAvailable(variation, qty)) {
      throw new ApiError(400, `"${product.name}" এর পর্যাপ্ত stock নেই`);
    }

    const freeShipping = Boolean(product.freeShipping);
    if (!freeShipping) allFreeShipping = false;
    return {
      ...item,
      ...extra,
      id: product.Id,
      variantId: variation.Id,
      name: product.name,
      ...describeVariation(variation),
      price,
      qty,
      freeShipping,
      preOrder: Boolean(variation.preOrder),
    };
  };

  // A combo becomes one line per product variant at its regular price, so stock and
  // order editing work as usual; the combo saving is charged as an order discount.
  const priceCombo = (item) => {
    const combo = combos.get(Number(item.comboOfferId));
    if (!combo || !comboLines(combo).length) {
      if (strict) throw new ApiError(400, `"${item.name || "Combo offer"}" অফারটি আর পাওয়া যাচ্ছে না`);
      allFreeShipping = false;
      return [{ ...item, qty: toQty(item.qty) }];
    }
    const comboQty = toQty(item.qty);
    const lines = comboLines(combo).map((line) => {
      const product = products.get(Number(line.productId));
      const variation = product && findVariation(product, line);
      return priceLine(
        {
          id: line.productId,
          variantId: line.variantId || undefined,
          name: product?.name,
          image: product ? productImage(product, variation) : null,
          qty: (Number(line.qty) || 1) * comboQty,
        },
        { comboOfferId: combo.Id, combo: combo.title },
      );
    });
    const regularTotal = lines.reduce((sum, line) => sum + Number(line.price || 0) * line.qty, 0);
    comboDiscount += Math.max(0, regularTotal - Number(combo.offerPrice || 0) * comboQty);
    return lines;
  };

  const items = payload.items.flatMap((item) => (isCombo(item) ? priceCombo(item) : [priceLine(item)]));

  const delivery = await resolveDeliveryArea(payload, strict);
  if (delivery) {
    return {
      ...payload,
      ...delivery.fields,
      items,
      deliveryCharge: allFreeShipping ? 0 : delivery.charge,
      comboDiscount: Math.round(comboDiscount * 100) / 100,
    };
  }

  // The storefront only charges delivery once a district is picked; a final order without
  // one (outdated client) is charged the outside-Dhaka rate rather than nothing.
  const district = String(payload.customerDistrict || "").trim();
  let deliveryCharge = 0;
  if (!allFreeShipping && (district || strict)) {
    deliveryCharge = await getWebsiteDeliveryCharge(district || "outside");
  }

  return { ...payload, items, deliveryCharge, comboDiscount: Math.round(comboDiscount * 100) / 100 };
};

/**
 * Public checkout: replaces client-sent names, prices and delivery charge with the ones
 * stored in the database. strict=false (incomplete drafts) keeps unresolvable items.
 */
const priceOrderItems = async (payload = {}, { strict = true } = {}) => {
  if (!Array.isArray(payload.items)) throw new ApiError(400, "No items in order");
  if (strict && !payload.items.length) throw new ApiError(400, "No items in order");

  const landingPageId = Number(payload.tracking?.landingPageId || 0);
  const isLanding = landingPageId > 0 &&
    String(payload.orderSource || payload.source || "").toLowerCase() === "landing page";

  const priced = isLanding
    ? await priceLandingOrder(payload, landingPageId, strict)
    : await priceWebsiteOrder(payload, strict);

  // Customers cannot mark money as already paid; staff record advances from the panel.
  return { ...priced, advance: 0 };
};

/**
 * Staff orders (POS / order edit): staff set prices and per-line discounts, but every
 * product line must point at a real variant so stock is tracked. Lines without a product
 * id are kept as free-text lines (legacy orders).
 */
// Extra or missing weight on a line may move it by at most half its nominal weight.
const MAX_WEIGHT_CHANGE = 0.5;

// Lines whose variant names a weight ("1 kg", "500 gm") can be reweighed, e.g. fish after
// cutting: staff enter how much heavier or lighter it came out (in the variant's own unit)
// and the line is repriced by the actual weight. basePrice keeps the unit price for the
// nominal weight, so editing again starts from it.
const applyWeightAdjust = (line, item, variation) => {
  const delta = Number(item.weightAdjust?.amount) || 0;
  const nominal = parseVariantWeight(getVariationOptions(variation));
  if (!nominal || !delta) return line;

  const basePrice = toMoney(item.basePrice ?? item.price);
  const nominalTotal = nominal.amount * line.qty;
  const change = item.weightAdjust.direction === "-" ? -Math.abs(delta) : Math.abs(delta);
  if (Math.abs(change) > nominalTotal * MAX_WEIGHT_CHANGE) {
    throw new ApiError(400, `"${line.name}" এর ওজন ${MAX_WEIGHT_CHANGE * 100}% এর বেশি কম-বেশি করা যাবে না`);
  }
  const actual = Math.round((nominalTotal + change) * 1000) / 1000;
  const lineTotal = Math.round(basePrice * line.qty * (actual / nominalTotal));
  return {
    ...line,
    price: toMoney(lineTotal / line.qty),
    disc: Math.min(line.disc, lineTotal),
    basePrice,
    weightAdjust: {
      direction: change < 0 ? "-" : "+",
      amount: Math.abs(change),
      unit: nominal.unit,
      nominal: nominalTotal,
      actual,
    },
  };
};

const resolveStaffItems = async (items = []) => {
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, "No items in order");
  const products = await loadProducts(items.map((item) => item.id));

  return items.map((item) => {
    const qty = toQty(item.qty);
    const price = toMoney(item.price);
    const disc = Math.min(toMoney(item.disc), price * qty);
    const base = {
      name: String(item.name || "Product"),
      image: item.image || null,
      price,
      qty,
      disc,
    };
    if (!item.id) return base;

    const product = products.get(Number(item.id));
    if (!product) throw new ApiError(400, `"${item.name || "Product"}" পণ্যটি পাওয়া যায়নি`);
    const variation = findVariation(product, item);
    if (!variation) throw new ApiError(400, `"${product.name}" এর variant বাছাই করুন`);

    return applyWeightAdjust(
      {
        ...base,
        id: product.Id,
        variantId: variation.Id,
        name: product.name,
        ...describeVariation(variation),
      },
      item,
      variation,
    );
  });
};

const calculateStaffTotals = (items, { deliveryCharge, discount }) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty - (item.disc || 0), 0);
  const delivery = toMoney(deliveryCharge);
  const orderDiscount = Math.min(toMoney(discount), subtotal + delivery);
  return {
    subtotal,
    deliveryCharge: delivery,
    discount: orderDiscount,
    total: Math.max(0, subtotal + delivery - orderDiscount),
  };
};

module.exports = {
  priceOrderItems,
  resolveStaffItems,
  calculateStaffTotals,
  getLandingOptions,
  getLandingVariants,
  loadProducts,
};
