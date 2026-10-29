require("dotenv").config();

const db = require("../models");

const DEMO_SKU_PREFIX = "DEMO-KAFELA-";
const DEMO_NOTE = "DEMO_PRODUCT_SEED_2026_08_06";

const cdn = (category, slug) =>
  `https://cdn.dummyjson.com/product-images/${category}/${slug}/thumbnail.webp`;

const local = (filename) => filename;

const productGroups = {
  "Mens Fashion": [
    ["Brown Shirt Front", local("fa80f049-9af5-4011-9bac-51452b84813e.webp"), 1850, 1490, "Cotton"],
    ["Brown Shirt Side", local("2d8874ae-1acf-411e-9ead-87e3b3110518.webp"), 1850, 1490, "Cotton"],
    ["Brown Shirt Back", local("96751938-2dd2-450e-874f-112f1fe7c0ae.webp"), 1850, 1490, "Cotton"],
    ["Brown Shirt Full Set", local("9a304af3-0d2e-4fc0-b111-2369584bee05.webp"), 1850, 1490, "Cotton"],
    ["Blue And Black Check Shirt", cdn("mens-shirts", "blue-&-black-check-shirt"), 1950, 1590, "Casual shirt"],
    ["Man Plaid Shirt", cdn("mens-shirts", "man-plaid-shirt"), 1750, 1390, "Regular fit"],
    ["Puma Future Rider Trainers", cdn("mens-shoes", "puma-future-rider-trainers"), 3400, 2890, "Comfort sole"],
    ["Nike Baseball Cleats", cdn("mens-shoes", "nike-baseball-cleats"), 3600, 2990, "Sports shoe"],
  ],
  "Womens Fashion": [
    ["Blue Frock", cdn("tops", "blue-frock"), 2200, 1790, "Comfort fit"],
    ["Girl Summer Dress", cdn("tops", "girl-summer-dress"), 1950, 1590, "Summer wear"],
    ["Gray Dress", cdn("tops", "gray-dress"), 2450, 1990, "Soft fabric"],
    ["Short Frock", cdn("tops", "short-frock"), 1850, 1490, "Party wear"],
    ["Tartan Dress", cdn("tops", "tartan-dress"), 2550, 2090, "Printed"],
    ["Prada Women Bag", cdn("womens-bags", "prada-women-bag"), 2850, 2390, "Handbag"],
    ["White Faux Leather Backpack", cdn("womens-bags", "white-faux-leather-backpack"), 2650, 2190, "Backpack"],
    ["Women Handbag Black", cdn("womens-bags", "women-handbag-black"), 2450, 1990, "Handbag"],
  ],
  Cosmetics: [
    ["Essence Mascara Lash Princess", cdn("beauty", "essence-mascara-lash-princess"), 950, 750, "Mascara"],
    ["Eyeshadow Palette With Mirror", cdn("beauty", "eyeshadow-palette-with-mirror"), 1850, 1490, "Palette"],
    ["Powder Canister", cdn("beauty", "powder-canister"), 1250, 990, "Face powder"],
    ["Red Lipstick", cdn("beauty", "red-lipstick"), 890, 690, "Lipstick"],
    ["Red Nail Polish", cdn("beauty", "red-nail-polish"), 650, 490, "Nail polish"],
    ["Attitude Hand Soap", cdn("skin-care", "attitude-super-leaves-hand-soap"), 850, 650, "Hand soap"],
    ["Olay Body Wash", cdn("skin-care", "olay-ultra-moisture-shea-butter-body-wash"), 1350, 1050, "Body wash"],
    ["Vaseline Men Lotion", cdn("skin-care", "vaseline-men-body-and-face-lotion"), 1250, 990, "Lotion"],
  ],
  Gadgets: [
    ["Amazon Echo Plus", cdn("mobile-accessories", "amazon-echo-plus"), 4200, 3490, "Smart speaker"],
    ["Apple Airpods", cdn("mobile-accessories", "apple-airpods"), 3850, 3290, "Wireless"],
    ["Apple AirPods Max Silver", cdn("mobile-accessories", "apple-airpods-max-silver"), 12500, 10990, "Headphone"],
    ["Apple Airpower Wireless Charger", cdn("mobile-accessories", "apple-airpower-wireless-charger"), 2650, 2190, "Wireless charger"],
    ["Apple HomePod Mini Cosmic Grey", cdn("mobile-accessories", "apple-homepod-mini-cosmic-grey"), 5800, 4990, "Speaker"],
    ["Apple iPhone Charger", cdn("mobile-accessories", "apple-iphone-charger"), 1450, 1150, "Fast charger"],
    ["Apple MagSafe Battery Pack", cdn("mobile-accessories", "apple-magsafe-battery-pack"), 3600, 2990, "Power bank"],
    ["Apple Watch Series 4 Gold", cdn("mobile-accessories", "apple-watch-series-4-gold"), 9800, 8490, "Smart watch"],
  ],
  Grocery: [
    ["Apple", cdn("groceries", "apple"), 320, 250, "Fresh"],
    ["Beef Steak", cdn("groceries", "beef-steak"), 1250, 990, "Premium cut"],
    ["Chicken Meat", cdn("groceries", "chicken-meat"), 850, 690, "Fresh"],
    ["Cooking Oil", cdn("groceries", "cooking-oil"), 980, 790, "1L"],
    ["Cucumber", cdn("groceries", "cucumber"), 220, 160, "Fresh"],
    ["Eggs", cdn("groceries", "eggs"), 480, 390, "Dozen"],
    ["Fish Steak", cdn("groceries", "fish-steak"), 1150, 890, "Fresh cut"],
    ["Green Bell Pepper", cdn("groceries", "green-bell-pepper"), 360, 290, "Fresh"],
  ],
  "Home & Lifestyle": [
    ["Annibale Colombo Bed", cdn("furniture", "annibale-colombo-bed"), 12500, 10990, "Furniture"],
    ["Annibale Colombo Sofa", cdn("furniture", "annibale-colombo-sofa"), 9800, 8490, "Furniture"],
    ["Bedside Table African Cherry", cdn("furniture", "bedside-table-african-cherry"), 3600, 2990, "Furniture"],
    ["Executive Conference Chair", cdn("furniture", "knoll-saarinen-executive-conference-chair"), 5200, 4490, "Chair"],
    ["Bathroom Sink With Mirror", cdn("furniture", "wooden-bathroom-sink-with-mirror"), 7800, 6690, "Furniture"],
    ["Decoration Swing", cdn("home-decoration", "decoration-swing"), 2650, 2190, "Decor"],
    ["Family Tree Photo Frame", cdn("home-decoration", "family-tree-photo-frame"), 1450, 1150, "Frame"],
    ["House Showpiece Plant", cdn("home-decoration", "house-showpiece-plant"), 1250, 990, "Decor"],
  ],
  "Eid Collection": [
    ["Oud Assam Gift Set", local("344ccd28-6e70-4a9e-af50-1864d1a8ebf0.webp"), 2200, 1790, "Gift set"],
    ["Concentrated Perfume Gift", local("dbed1ccb-a0d1-4271-a037-a6967741329e.webp"), 850, 450, "Perfume oil"],
    ["Calvin Klein CK One", cdn("fragrances", "calvin-klein-ck-one"), 2450, 1990, "Perfume"],
    ["Chanel Coco Noir Eau De", cdn("fragrances", "chanel-coco-noir-eau-de"), 2850, 2390, "Perfume"],
    ["Dior J'adore", cdn("fragrances", "dior-j'adore"), 3200, 2690, "Perfume"],
    ["Dolce Shine Eau De", cdn("fragrances", "dolce-shine-eau-de"), 2600, 2190, "Perfume"],
    ["Premium Date Gift", cdn("groceries", "apple"), 1250, 990, "Gift box"],
    ["Eid Brown Shirt", local("fa80f049-9af5-4011-9bac-51452b84813e.webp"), 1850, 1490, "Cotton"],
  ],
  "Stationary and Craft": [
    ["Bamboo Spatula", cdn("kitchen-accessories", "bamboo-spatula"), 450, 320, "Craft wood"],
    ["Black Aluminium Cup", cdn("kitchen-accessories", "black-aluminium-cup"), 650, 490, "Utility cup"],
    ["Black Whisk", cdn("kitchen-accessories", "black-whisk"), 590, 450, "Metal craft"],
    ["Boxed Blender", cdn("kitchen-accessories", "boxed-blender"), 2450, 1990, "Boxed item"],
    ["Chopping Board", cdn("kitchen-accessories", "chopping-board"), 780, 620, "Board"],
    ["Fine Mesh Strainer", cdn("kitchen-accessories", "fine-mesh-strainer"), 690, 520, "Mesh"],
    ["Cricket Ball", cdn("sports-accessories", "cricket-ball"), 550, 390, "Ball"],
    ["Feather Shuttlecock", cdn("sports-accessories", "feather-shuttlecock"), 450, 320, "Shuttlecock"],
  ],
  Perfumes: [
    ["Alhan Concentrated Perfume Oil", local("dbed1ccb-a0d1-4271-a037-a6967741329e.webp"), 500, 450, "12ml"],
    ["Oud Assam Perfume Oil", local("344ccd28-6e70-4a9e-af50-1864d1a8ebf0.webp"), 1250, 990, "12ml"],
    ["Calvin Klein CK One", cdn("fragrances", "calvin-klein-ck-one"), 2450, 1990, "100ml"],
    ["Chanel Coco Noir Eau De", cdn("fragrances", "chanel-coco-noir-eau-de"), 2850, 2390, "100ml"],
    ["Dior J'adore", cdn("fragrances", "dior-j'adore"), 3200, 2690, "100ml"],
    ["Dolce Shine Eau De", cdn("fragrances", "dolce-shine-eau-de"), 2600, 2190, "100ml"],
    ["Gucci Bloom Eau De", cdn("fragrances", "gucci-bloom-eau-de"), 2950, 2490, "100ml"],
    ["Oud Gift Collection", local("db1d1784-0a8d-4fb5-99f6-3f9b0928c45a.webp"), 3400, 2890, "Gift set"],
  ],
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const getNameMap = async (Model) => {
  const rows = await Model.findAll({ attributes: ["Id", "name"], raw: true });
  return rows.reduce((map, row) => {
    map.set(String(row.name || "").trim().toLowerCase(), row.Id);
    return map;
  }, new Map());
};

const buildDemoProducts = () =>
  Object.entries(productGroups).flatMap(([category, items]) =>
    items.map(([name, image, oldPrice, newPrice, attribute], index) => {
      const fullName = `Demo ${name}`;
      return {
        name: fullName,
        sku: `${DEMO_SKU_PREFIX}${slugify(category).toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
        category,
        brand: category === "Perfumes" ? "Lattafa" : "Wazih",
        image,
        shortDescription: `${name} sample product for ${category}.`,
        description: `Demo product only. Marked with ${DEMO_NOTE} so it can be removed later.`,
        oldPrice,
        newPrice,
        purchasePrice: Math.round(Number(newPrice) * 0.72),
        stock: 18 + index * 5,
        attribute,
      };
    }),
  );

const seed = async () => {
  const categoryMap = await getNameMap(db.category);
  const brandMap = await getNameMap(db.brand);
  const created = [];
  const updated = [];

  for (const item of buildDemoProducts()) {
    const productPayload = {
      name: item.name,
      slug: slugify(item.name),
      sku: item.sku,
      categoryId: categoryMap.get(item.category.toLowerCase()) || null,
      brandId: brandMap.get(item.brand.toLowerCase()) || null,
      shortDescription: item.shortDescription,
      description: item.description,
      metaTitle: item.name,
      metaKeyword: "demo,kafela,product",
      metaDescription: item.shortDescription,
      images: [item.image],
      gallery: [item.image],
      file: item.image,
      bestDeals: true,
      freeShipping: false,
      stockAlert: 5,
      status: "Active",
      date: new Date().toISOString().slice(0, 10),
      note: DEMO_NOTE,
    };

    const [product, wasCreated] = await db.product.findOrCreate({
      where: { sku: item.sku },
      defaults: productPayload,
      paranoid: false,
    });

    if (!wasCreated) {
      await product.restore?.();
      await product.update(productPayload);
      updated.push(product.Id);
    } else {
      created.push(product.Id);
    }

    await db.variation.destroy({ where: { productId: product.Id }, force: true });
    await db.variation.create({
      productId: product.Id,
      attribute: item.attribute,
      purchasePrice: item.purchasePrice,
      oldPrice: item.oldPrice,
      newPrice: item.newPrice,
      stock: item.stock,
      availability: "in stock",
    });
  }

  return { created, updated };
};

const cleanup = async () => {
  const where = {
    sku: { [db.Sequelize.Op.like]: `${DEMO_SKU_PREFIX}%` },
    note: DEMO_NOTE,
  };
  const products = await db.product.findAll({
    attributes: ["Id", "name", "sku"],
    where,
    paranoid: false,
    raw: true,
  });
  const productIds = products.map((product) => product.Id);

  if (productIds.length) {
    await db.variation.destroy({ where: { productId: productIds } });
    await db.product.destroy({ where });
  }

  return { deleted: products };
};

const main = async () => {
  await db.ready;

  const action = process.argv[2] || "seed";
  if (!["seed", "cleanup"].includes(action)) {
    throw new Error("Usage: node tools/seedDemoProducts.js [seed|cleanup]");
  }

  const result = action === "cleanup" ? await cleanup() : await seed();
  console.log(JSON.stringify({ action, ...result }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
