const { literal } = require("sequelize");
const db = require("../../../models");

// Advanced filters for the admin order list. Most order details live in the JSON `note`
// column, so these are raw SQL conditions against the `Order` alias of findAndCountAll.

const ORDER_LIST_FILTER_KEYS = [
  "orderIds",
  "employeeAction",
  "team",
  "orderSource",
  "orderSourceExclude",
  "orderTag",
  "customerTag",
  "customerType",
  "courier",
  "courierExclude",
  "courierStatus",
  "courierStatusExclude",
  "performanceMetric",
  "performanceValue",
  "performanceOp",
  "courierCharged",
  "deliveryCharge",
  "codChanged",
  "category",
  "categoryExclude",
  "categoryOnly",
  "product",
  "productExclude",
  "productOnly",
  "includeReturns",
  "district",
  "districtExclude",
  "paymentStatus",
  "orderType",
  "stockAvailability",
  "website",
  "printStatus",
  "printDate",
  "courierMark",
  "pathaoCity",
  "pathaoZone",
  "cancelReason",
  "bdMobile",
  "emailStatus",
  "utmSource",
  "utmSourceExclude",
  "amountMin",
  "amountMax",
  "itemsMetric",
  "itemsValue",
  "itemsOp",
  "urlUtm",
  "referenceId",
  "discountValue",
  "discountOp",
  "salesIncludeReturns",
];

const COMPARE_OPERATORS = { gte: ">=", lte: "<=", gt: ">", lt: "<", eq: "=" };

const NOTE = "`Order`.`note`";
const esc = (value) => db.sequelize.escape(value);
const isOn = (value) => value === true || value === "true" || value === "1";

const toList = (value) =>
  (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean);

const toIdList = (value) => toList(value).map(Number).filter((id) => Number.isInteger(id) && id > 0);

const toNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const metaJson = (path) => `(CASE WHEN JSON_VALID(${NOTE}) THEN JSON_EXTRACT(${NOTE}, '${path}') END)`;
const metaText = (path) => `NULLIF(NULLIF(JSON_UNQUOTE(${metaJson(path)}), 'null'), '')`;
const metaNumber = (path) => `CAST(${metaText(path)} AS DECIMAL(12,2))`;

const phoneKey = (column) => `RIGHT(REGEXP_REPLACE(${column}, '[^0-9]', ''), 10)`;

const STEADFAST = "$.courierIntegration.steadfast";
const PATHAO = "$.courierIntegration.pathao";
const courierBooked = `COALESCE(${metaText(`${STEADFAST}.consignmentId`)}, ${metaText(`${STEADFAST}.trackingCode`)}, ${metaText(`${PATHAO}.consignmentId`)}) IS NOT NULL`;

// Mirrors getOrderDueAmount() in order.service.js
const dueAmount = `GREATEST(0,
  COALESCE(NULLIF(\`Order\`.\`totalBill\`, 0), ${metaNumber("$.total")}, 0)
  - COALESCE(${metaNumber("$.discount")}, ${metaNumber("$.less")}, 0)
  - COALESCE(NULLIF(\`Order\`.\`advance\`, 0), ${metaNumber("$.advance")}, ${metaNumber("$.paid")}, 0))`;

const itemsTable = (columns) =>
  `JSON_TABLE(${metaJson("$.items")}, '$[*]' COLUMNS (${columns})) AS it`;
const itemProductId = "COALESCE(it.pid, it.pid2)";

const inList = (expr, values, exclude) => {
  const list = values.map((value) => esc(value.toLowerCase())).join(", ");
  return `LOWER(TRIM(COALESCE(${expr}, ''))) ${exclude ? "NOT IN" : "IN"} (${list})`;
};

// JSON values come back with a binary collation, so compare lowercased text.
const likeText = (expr, term) => `LOWER(${expr}) LIKE ${esc(`%${String(term).toLowerCase()}%`)}`;

const compare = (expr, op, value) => {
  const operator = COMPARE_OPERATORS[op] || ">=";
  return `${expr} ${operator} ${esc(value)}`;
};

const tableName = (model) => {
  const name = model.getTableName();
  return `\`${typeof name === "string" ? name : name.tableName}\``;
};

// Product filter shared by "Select Product" and "Product Category": productSql is either a
// literal id list or a subquery returning product ids.
const productMatch = (productSql, { exclude, only }) => {
  const table = itemsTable("pid VARCHAR(32) PATH '$.id', pid2 VARCHAR(32) PATH '$.productId'");
  const hasMatch = `EXISTS (SELECT 1 FROM ${table} WHERE ${itemProductId} IN (${productSql}))`;
  if (exclude) return `NOT ${hasMatch}`;
  if (!only) return hasMatch;
  return `(${hasMatch} AND NOT EXISTS (SELECT 1 FROM ${table} WHERE ${itemProductId} NOT IN (${productSql})))`;
};

const PRINT_DATE_DAYS = { today: 0, yesterday: 1, last7: 6, last30: 29 };

const buildPrintDateCondition = (printDate) => {
  if (!(printDate in PRINT_DATE_DAYS)) return null;
  const printedDay = `DATE(${metaText("$.printedAt")})`;
  if (printDate === "yesterday") return `${printedDay} = CURDATE() - INTERVAL 1 DAY`;
  return `${printedDay} >= CURDATE() - INTERVAL ${PRINT_DATE_DAYS[printDate]} DAY`;
};

// A source matches by its utm_source value or by the ad platform's click id.
const utmSourceIs = (values) =>
  `LOWER(COALESCE(${metaText("$.tracking.utm_source")}, '')) IN (${values.map(esc).join(", ")})`;
const UTM_SOURCE_CONDITIONS = {
  facebook: `(${metaText("$.tracking.fbc")} IS NOT NULL OR ${utmSourceIs(["facebook", "fb", "instagram", "ig", "meta"])})`,
  tiktok: `(${metaText("$.tracking.ttclid")} IS NOT NULL OR ${utmSourceIs(["tiktok", "tt"])})`,
  google: `(COALESCE(${metaText("$.tracking.gclid")}, ${metaText("$.tracking.gbraid")}, ${metaText("$.tracking.wbraid")}) IS NOT NULL OR ${utmSourceIs(["google", "youtube"])})`,
};
UTM_SOURCE_CONDITIONS.none = `NOT (${Object.values(UTM_SOURCE_CONDITIONS).join(" OR ")} OR ${metaText("$.tracking.utm_source")} IS NOT NULL)`;

const buildOrderListFilterConditions = (filters = {}) => {
  const conditions = [];
  const add = (sql) => conditions.push(literal(`(${sql})`));

  const orderIds = toIdList(filters.orderIds);
  if (orderIds.length) add(`\`Order\`.\`Id\` IN (${orderIds.join(", ")})`);

  if (filters.team) {
    add(`\`Order\`.\`assignedEmployeeId\` IN (SELECT Id FROM ${tableName(db.user)} WHERE LOWER(role) = ${esc(String(filters.team).toLowerCase())})`);
  }

  const orderSources = toList(filters.orderSource);
  if (orderSources.length) {
    add(inList(`COALESCE(NULLIF(\`Order\`.\`orderSource\`, ''), ${metaText("$.orderSource")})`, orderSources, isOn(filters.orderSourceExclude)));
  }

  const orderTags = toList(filters.orderTag).map((value) => (value === "none" ? "" : value));
  if (orderTags.length) add(inList(metaText("$.orderTag"), orderTags, false));

  if (["safe", "fake"].includes(filters.customerTag)) {
    const values = filters.customerTag === "fake" ? ["fake", "fake_order"] : ["safe", "clear"];
    add(inList("`Order`.`fraudStatus`", values, false));
  } else if (filters.customerTag === "unmarked") {
    add(inList("`Order`.`fraudStatus`", ["fake", "fake_order", "safe", "clear"], true));
  }

  if (["new", "repeat"].includes(filters.customerType)) {
    // A customer's first (non-deleted) order is "new", every later one is "repeat".
    const firstOrders = `SELECT ${phoneKey("o2.customerPhone")}, MIN(o2.Id) FROM ${tableName(db.order)} o2 WHERE o2.deletedAt IS NULL GROUP BY ${phoneKey("o2.customerPhone")}`;
    add(`(${phoneKey("`Order`.`customerPhone`")}, \`Order\`.\`Id\`) ${filters.customerType === "new" ? "IN" : "NOT IN"} (${firstOrders})`);
  }

  const couriers = toList(filters.courier).map((value) => (value === "none" ? "" : value));
  if (couriers.length) add(inList("`Order`.`courier`", couriers, isOn(filters.courierExclude)));

  const courierStatuses = toList(filters.courierStatus);
  if (courierStatuses.length) {
    add(inList(`COALESCE(${metaText(`${STEADFAST}.status`)}, ${metaText(`${PATHAO}.status`)})`, courierStatuses, isOn(filters.courierStatusExclude)));
  }

  const performanceValue = toNumber(filters.performanceValue);
  if (performanceValue !== null) {
    const fraudTable = tableName(db.orderFraudCheck);
    const metric = filters.performanceMetric === "totalParcel"
      ? `(SELECT SUM(st.totalParcel) FROM ${fraudTable} f, JSON_TABLE(f.courierStats, '$[*]' COLUMNS (totalParcel INT PATH '$.totalParcel')) AS st WHERE f.orderId = \`Order\`.\`Id\` AND f.deletedAt IS NULL)`
      : `(SELECT f.successRate FROM ${fraudTable} f WHERE f.orderId = \`Order\`.\`Id\` AND f.deletedAt IS NULL LIMIT 1)`;
    add(compare(metric, filters.performanceOp, performanceValue));
  }

  if (filters.courierCharged === "yes") add(courierBooked);
  if (filters.courierCharged === "no") add(`NOT ${courierBooked}`);

  if (filters.deliveryCharge === "free") add(`COALESCE(${metaNumber("$.deliveryCharge")}, 0) = 0`);
  if (filters.deliveryCharge === "charged") add(`COALESCE(${metaNumber("$.deliveryCharge")}, 0) > 0`);

  if (["yes", "no"].includes(filters.codChanged)) {
    const bookedCod = `COALESCE(${metaNumber(`${STEADFAST}.lastPayload.cod_amount`)}, ${metaNumber(`${PATHAO}.lastPayload.amount_to_collect`)})`;
    const changed = `(${bookedCod} IS NOT NULL AND ABS(${bookedCod} - ${dueAmount}) >= 0.01)`;
    add(filters.codChanged === "yes" ? changed : `NOT ${changed}`);
  }

  const productIds = toIdList(filters.product);
  if (productIds.length) {
    add(productMatch(productIds.join(", "), {
      exclude: isOn(filters.productExclude),
      only: isOn(filters.productOnly),
    }));
  }

  const categoryIds = toIdList(filters.category);
  if (categoryIds.length) {
    add(productMatch(`SELECT Id FROM ${tableName(db.product)} WHERE categoryId IN (${categoryIds.join(", ")})`, {
      exclude: isOn(filters.categoryExclude),
      only: isOn(filters.categoryOnly),
    }));
  }

  const districts = toList(filters.district);
  if (districts.length) add(inList("`Order`.`customerDistrict`", districts, isOn(filters.districtExclude)));

  const paymentStatuses = toList(filters.paymentStatus);
  if (paymentStatuses.length) {
    add(inList(`COALESCE(${metaText("$.paymentStatus")}, 'pending')`, paymentStatuses, false));
  }

  if (["pre_order", "regular"].includes(filters.orderType)) {
    const preOrder = `COALESCE(JSON_CONTAINS(${metaJson("$.items[*].preOrder")}, 'true'), 0) = 1`;
    add(filters.orderType === "pre_order" ? preOrder : `NOT ${preOrder}`);
  }

  if (["in_stock", "out_of_stock"].includes(filters.stockAvailability)) {
    // Orders holding a stock ledger already reserved their units; others need enough stock now.
    const table = itemsTable("vid INT PATH '$.variantId', qty INT PATH '$.qty'");
    const shortage = `(COALESCE(JSON_LENGTH(\`Order\`.\`stockLedger\`), 0) = 0 AND EXISTS (
      SELECT 1 FROM ${table} JOIN ${tableName(db.variation)} v ON v.Id = it.vid
      WHERE v.preOrder = 0 AND COALESCE(v.stock, 0) < COALESCE(it.qty, 1)))`;
    add(filters.stockAvailability === "out_of_stock" ? shortage : `NOT ${shortage}`);
  }

  if (["main", "landing"].includes(filters.website)) {
    const landing = `(${metaText("$.tracking.landingPageId")} IS NOT NULL OR LOWER(COALESCE(\`Order\`.\`orderSource\`, '')) = 'landing page')`;
    add(filters.website === "landing" ? landing : `NOT ${landing}`);
  }

  if (filters.printStatus === "printed") {
    add(`${metaText("$.printedAt")} IS NOT NULL`);
    const dateCondition = buildPrintDateCondition(filters.printDate);
    if (dateCondition) add(dateCondition);
  } else if (filters.printStatus === "not_printed") {
    add(`${metaText("$.printedAt")} IS NULL`);
  }

  if (filters.courierMark === "marked") add(`COALESCE(\`Order\`.\`courier\`, '') <> '' AND NOT ${courierBooked}`);
  if (filters.courierMark === "unmarked") add("COALESCE(`Order`.`courier`, '') = ''");

  if (filters.pathaoCity) add(`${metaText(`${PATHAO}.lastPayload.recipient_city`)} = ${esc(String(filters.pathaoCity))}`);
  if (filters.pathaoZone) add(`${metaText(`${PATHAO}.lastPayload.recipient_zone`)} = ${esc(String(filters.pathaoZone))}`);

  if (filters.cancelReason) {
    // Reasons come from the Steadfast return request or the admin notes on the order.
    add(`${likeText(metaText(`${STEADFAST}.returnReason`), filters.cancelReason)}
      OR ${likeText(`JSON_UNQUOTE(${metaJson("$.adminNotes")})`, filters.cancelReason)}`);
  }

  if (["valid", "invalid"].includes(filters.bdMobile)) {
    const valid = "REGEXP_REPLACE(`Order`.`customerPhone`, '[^0-9]', '') REGEXP '^(88)?01[3-9][0-9]{8}$'";
    add(filters.bdMobile === "valid" ? valid : `NOT ${valid}`);
  }

  if (["has_email", "no_email"].includes(filters.emailStatus)) {
    // Customers are user accounts; an order has an email when its phone's account has one.
    const hasEmail = `EXISTS (SELECT 1 FROM ${tableName(db.user)} u
      WHERE LOWER(u.role) = 'user' AND COALESCE(TRIM(u.Email), '') <> ''
      AND ${phoneKey("u.Phone")} = ${phoneKey("`Order`.`customerPhone`")})`;
    add(filters.emailStatus === "has_email" ? hasEmail : `NOT ${hasEmail}`);
  }

  const utmSources = toList(filters.utmSource).filter((source) => UTM_SOURCE_CONDITIONS[source]);
  if (utmSources.length) {
    const match = utmSources.map((source) => UTM_SOURCE_CONDITIONS[source]).join(" OR ");
    add(isOn(filters.utmSourceExclude) ? `NOT (${match})` : match);
  }

  const productAmount = `COALESCE(${metaNumber("$.subtotal")}, \`Order\`.\`totalBill\`, 0)`;
  const amountMin = toNumber(filters.amountMin);
  const amountMax = toNumber(filters.amountMax);
  if (amountMin !== null) add(compare(productAmount, "gte", amountMin));
  if (amountMax !== null) add(compare(productAmount, "lte", amountMax));

  const itemsValue = toNumber(filters.itemsValue);
  if (itemsValue !== null) {
    const metric = filters.itemsMetric === "products"
      ? `COALESCE(JSON_LENGTH(${metaJson("$.items")}), 1)`
      : "`Order`.`quantity`";
    add(compare(metric, filters.itemsOp, itemsValue));
  }

  if (filters.urlUtm) {
    add(likeText(`JSON_UNQUOTE(${metaJson("$.tracking")})`, filters.urlUtm));
  }

  if (filters.referenceId) {
    add([
      `${STEADFAST}.consignmentId`,
      `${STEADFAST}.trackingCode`,
      `${PATHAO}.consignmentId`,
    ].map((path) => likeText(metaText(path), filters.referenceId)).join(" OR "));
  }

  const discountValue = toNumber(filters.discountValue);
  if (discountValue !== null) {
    add(compare(`COALESCE(${metaNumber("$.discount")}, ${metaNumber("$.less")}, 0)`, filters.discountOp, discountValue));
  }

  return conditions;
};

const hasProductFilter = (filters = {}) =>
  toIdList(filters.product).length > 0 || toIdList(filters.category).length > 0;

module.exports = {
  ORDER_LIST_FILTER_KEYS,
  buildOrderListFilterConditions,
  hasProductFilter,
  isOn,
  metaText,
};
