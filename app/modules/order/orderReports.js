// Summary reports over the orders matched by the admin order filter. Each report returns
// { title, columns: [{ key, label }], rows } so the admin can render any of them as a table.

const RETURN_STATUSES = ["returned", "return_received"];
const FAILED_STATUSES = ["cancelled", ...RETURN_STATUSES, "on_hold"];
const DELIVERED_STATUSES = ["delivered"];

const AMOUNT_BUCKETS = [
  [0, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, Infinity],
];

const parseMeta = (note) => {
  if (!note || typeof note !== "string") return {};
  try {
    const meta = JSON.parse(note);
    return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  } catch {
    return {};
  }
};

const num = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round = (value) => Math.round(value * 100) / 100;
const text = (value) => String(value ?? "").trim();
const label = (value) =>
  text(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Flattens an order row and its JSON note into the fields the reports use.
const toReportOrder = (row) => {
  const meta = parseMeta(row.note);
  const steadfast = meta.courierIntegration?.steadfast || {};
  const pathao = meta.courierIntegration?.pathao || {};
  const tracking = meta.tracking && typeof meta.tracking === "object" ? meta.tracking : {};
  const total = num(row.totalBill || meta.total);
  const discount = num(meta.discount || meta.less);
  const advance = num(row.advance || meta.advance || meta.paid);
  const items = Array.isArray(meta.items) && meta.items.length
    ? meta.items.map((item) => ({
        productId: item.id ?? item.productId ?? null,
        name: text(item.name) || text(row.productName) || "Unknown product",
        variant: text(item.variant),
        qty: num(item.qty) || 1,
        price: num(item.price),
      }))
    : [{ productId: null, name: text(row.productName) || "Unknown product", variant: "", qty: num(row.quantity) || 1, price: total / (num(row.quantity) || 1) }];
  const adminNotes = (Array.isArray(meta.adminNotes) ? meta.adminNotes : [])
    .map((item) => (typeof item === "string" ? { text: item, createdAt: null } : { text: text(item?.text), createdAt: item?.createdAt || null }))
    .filter((item) => item.text);

  return {
    ...row,
    meta,
    status: text(row.status).toLowerCase(),
    total,
    discount,
    advance,
    // totalBill is already after discount (subtotal + delivery - discount).
    due: Math.max(0, total - advance),
    subtotal: meta.subtotal !== undefined ? num(meta.subtotal) : total,
    deliveryCharge: num(meta.deliveryCharge),
    items,
    adminNotes,
    tracking,
    source: text(row.orderSource) || text(meta.orderSource || meta.source || meta.platform) || "Unknown",
    courierName: text(row.courier) || "Not Set",
    courierStatus: text(steadfast.status || pathao.status).toLowerCase(),
    consignment: text(steadfast.consignmentId || steadfast.trackingCode || pathao.consignmentId),
    courierUpdatedAt: steadfast.updatedAt || pathao.updatedAt || null,
    returnReason: text(steadfast.returnReason),
    statusHistory: Array.isArray(meta.statusHistory) ? meta.statusHistory : [],
    employeeName: text(row.assignedEmployeeName) || "Not Assigned",
  };
};

const getUtmSource = (order) => {
  const { tracking } = order;
  const utm = text(tracking.utm_source || tracking.utmSource).toLowerCase();
  if (utm) return utm;
  if (tracking.fbc || tracking.fbclid) return "facebook";
  if (tracking.ttclid) return "tiktok";
  if (tracking.gclid || tracking.gbraid || tracking.wbraid) return "google";
  return "direct / none";
};

const getCampaign = (order) => {
  const { tracking } = order;
  return text(tracking.utm_campaign || tracking.campaign_id || tracking.campaignId || tracking.utm_id) || "No Campaign";
};

const getWebsite = (order) => {
  const { tracking } = order;
  if (tracking.landingPage || tracking.landingPageId) {
    return `Landing Page: ${text(tracking.landingPage) || `#${tracking.landingPageId}`}`;
  }
  if (order.source.toLowerCase() === "landing page") return "Landing Page";
  if (order.source.toLowerCase() === "website") return "Main Website";
  return `Admin Panel (${order.source})`;
};

const getAmountBucket = (order) => {
  const [min, max] = AMOUNT_BUCKETS.find(([low, high]) => order.total >= low && order.total < high) || AMOUNT_BUCKETS[0];
  return max === Infinity ? `${min}+ ৳` : `${min} - ${max - 1} ৳`;
};

const toTime = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
};

// The newest of: status change, courier update, admin note.
const getLastEvent = (order) => {
  const events = [];
  const lastStatus = order.statusHistory[order.statusHistory.length - 1];
  if (lastStatus) {
    events.push({ event: `Status: ${label(lastStatus.from) || "New"} → ${label(lastStatus.to)}`, at: lastStatus.at });
  }
  if (order.courierStatus) {
    events.push({ event: `${order.courierName}: ${label(order.courierStatus)}`, at: order.courierUpdatedAt });
  }
  const lastNote = order.adminNotes[order.adminNotes.length - 1];
  if (lastNote) events.push({ event: `Note: ${lastNote.text}`, at: lastNote.createdAt });
  if (!events.length) return { event: `Status: ${label(order.status)}`, at: order.updatedAt };
  return events.reduce((latest, item) => (toTime(item.at) >= toTime(latest.at) ? item : latest));
};

const formatDateTime = (value) => {
  const time = toTime(value);
  return time ? new Date(time).toISOString().replace("T", " ").slice(0, 16) : "";
};

// Group orders by a key with count, amount and delivery outcome columns.
const GROUP_COLUMNS = [
  { key: "orders", label: "Orders" },
  { key: "amount", label: "Amount" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Cancelled/Returned" },
  { key: "successRate", label: "Delivery %" },
];

const groupOrders = (orders, keyFn, keyLabel) => {
  const groups = new Map();
  orders.forEach((order) => {
    const key = keyFn(order);
    const group = groups.get(key) || { name: key, orders: 0, amount: 0, delivered: 0, failed: 0 };
    group.orders += 1;
    group.amount += order.total;
    if (DELIVERED_STATUSES.includes(order.status)) group.delivered += 1;
    if (FAILED_STATUSES.includes(order.status)) group.failed += 1;
    groups.set(key, group);
  });
  const rows = [...groups.values()].map((group) => {
    const finished = group.delivered + group.failed;
    return {
      ...group,
      amount: round(group.amount),
      successRate: finished ? `${Math.round((group.delivered / finished) * 100)}%` : "-",
    };
  });
  rows.sort((a, b) => b.orders - a.orders);
  return { columns: [{ key: "name", label: keyLabel }, ...GROUP_COLUMNS], rows };
};

const itemKey = (item) => `${item.name}|||${item.variant}`;

const REPORTS = {
  order_items: {
    title: "Order Items",
    build: (orders) => {
      const groups = new Map();
      orders.forEach((order) => {
        const seen = new Set();
        order.items.forEach((item) => {
          const key = itemKey(item);
          const group = groups.get(key) || { product: item.name, variant: item.variant || "-", orders: 0, quantity: 0, amount: 0 };
          if (!seen.has(key)) group.orders += 1;
          seen.add(key);
          group.quantity += item.qty;
          group.amount += item.qty * item.price;
          groups.set(key, group);
        });
      });
      const rows = [...groups.values()]
        .map((row) => ({ ...row, amount: round(row.amount) }))
        .sort((a, b) => b.quantity - a.quantity);
      return {
        columns: [
          { key: "product", label: "Product" },
          { key: "variant", label: "Variant" },
          { key: "orders", label: "Orders" },
          { key: "quantity", label: "Quantity" },
          { key: "amount", label: "Amount" },
        ],
        rows,
      };
    },
  },

  items_status: {
    title: "Items Status Wise",
    build: (orders) => {
      const statuses = [...new Set(orders.map((order) => order.status))].sort();
      const groups = new Map();
      orders.forEach((order) => {
        order.items.forEach((item) => {
          const key = itemKey(item);
          const group = groups.get(key) || { product: item.name, variant: item.variant || "-", total: 0 };
          group[order.status] = (group[order.status] || 0) + item.qty;
          group.total += item.qty;
          groups.set(key, group);
        });
      });
      const rows = [...groups.values()]
        .map((row) => ({ ...Object.fromEntries(statuses.map((status) => [status, 0])), ...row }))
        .sort((a, b) => b.total - a.total);
      return {
        columns: [
          { key: "product", label: "Product" },
          { key: "variant", label: "Variant" },
          ...statuses.map((status) => ({ key: status, label: label(status) })),
          { key: "total", label: "Total Qty" },
        ],
        rows,
      };
    },
  },

  order_sources: {
    title: "Order Sources",
    build: (orders) => groupOrders(orders, (order) => order.source, "Source"),
  },

  duplicate_orders: {
    title: "Duplicate Orders",
    build: (orders) => {
      const groups = new Map();
      orders.forEach((order) => {
        const phone = String(order.customerPhone || "").replace(/\D/g, "").slice(-10);
        if (!phone) return;
        const list = groups.get(phone) || [];
        list.push(order);
        groups.set(phone, list);
      });
      const rows = [...groups.values()]
        .filter((list) => list.length > 1)
        .map((list) => ({
          phone: list[0].customerPhone,
          customer: list[0].customerName,
          orders: list.length,
          invoices: list.map((order) => order.orderId).join(", "),
          statuses: [...new Set(list.map((order) => label(order.status)))].join(", "),
          amount: round(list.reduce((sum, order) => sum + order.total, 0)),
        }))
        .sort((a, b) => b.orders - a.orders);
      return {
        columns: [
          { key: "phone", label: "Phone" },
          { key: "customer", label: "Customer" },
          { key: "orders", label: "Orders" },
          { key: "invoices", label: "Invoices" },
          { key: "statuses", label: "Statuses" },
          { key: "amount", label: "Amount" },
        ],
        rows,
      };
    },
  },

  orders_employee: {
    title: "Orders Employee",
    build: (orders) => groupOrders(orders, (order) => order.employeeName, "Employee"),
  },

  order_source_website: {
    title: "Order Source Website",
    build: (orders) => groupOrders(orders, getWebsite, "Website"),
  },

  utm_sources: {
    title: "UTM Sources",
    build: (orders) => groupOrders(orders, (order) => label(getUtmSource(order)), "UTM Source"),
  },

  campaign_ids: {
    title: "Campaign IDs",
    build: (orders) => groupOrders(orders, getCampaign, "Campaign"),
  },

  order_previous_status: {
    title: "Order Previous Status",
    build: (orders) => {
      const groups = new Map();
      orders.forEach((order) => {
        const last = order.statusHistory[order.statusHistory.length - 1];
        const previous = last ? label(last.from) || "New" : "No history";
        const key = `${previous}|||${order.status}`;
        const group = groups.get(key) || { previous, current: label(order.status), orders: 0, amount: 0 };
        group.orders += 1;
        group.amount += order.total;
        groups.set(key, group);
      });
      const rows = [...groups.values()]
        .map((row) => ({ ...row, amount: round(row.amount) }))
        .sort((a, b) => b.orders - a.orders);
      return {
        columns: [
          { key: "previous", label: "Previous Status" },
          { key: "current", label: "Current Status" },
          { key: "orders", label: "Orders" },
          { key: "amount", label: "Amount" },
        ],
        rows,
      };
    },
  },

  orders_by_locations: {
    title: "Orders by Locations",
    build: (orders) => groupOrders(orders, (order) => text(order.customerDistrict) || "Unknown", "District"),
  },

  orders_by_amount: {
    title: "Orders by Amount",
    build: (orders) => {
      const report = groupOrders(orders, getAmountBucket, "Order Amount");
      const bucketOrder = AMOUNT_BUCKETS.map(([min, max]) => (max === Infinity ? `${min}+ ৳` : `${min} - ${max - 1} ৳`));
      report.rows.sort((a, b) => bucketOrder.indexOf(a.name) - bucketOrder.indexOf(b.name));
      return report;
    },
  },

  courier_statuses: {
    title: "Courier Statuses",
    build: (orders) => {
      const groups = new Map();
      orders.forEach((order) => {
        const status = order.courierStatus ? label(order.courierStatus) : "Not Booked";
        const key = `${order.courierName}|||${status}`;
        const group = groups.get(key) || { courier: order.courierName, courierStatus: status, orders: 0, amount: 0 };
        group.orders += 1;
        group.amount += order.total;
        groups.set(key, group);
      });
      const rows = [...groups.values()]
        .map((row) => ({ ...row, amount: round(row.amount) }))
        .sort((a, b) => a.courier.localeCompare(b.courier) || b.orders - a.orders);
      return {
        columns: [
          { key: "courier", label: "Courier" },
          { key: "courierStatus", label: "Courier Status" },
          { key: "orders", label: "Orders" },
          { key: "amount", label: "Amount" },
        ],
        rows,
      };
    },
  },

  failed_last_event: {
    title: "Failed Order Last Event",
    build: (orders) => ({
      columns: [
        { key: "invoice", label: "Invoice" },
        { key: "customer", label: "Customer" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        { key: "lastEvent", label: "Last Event" },
        { key: "eventAt", label: "Event Time" },
      ],
      rows: orders
        .filter((order) => FAILED_STATUSES.includes(order.status))
        .map((order) => {
          const last = getLastEvent(order);
          return {
            invoice: order.orderId,
            customer: order.customerName,
            phone: order.customerPhone,
            status: label(order.status),
            lastEvent: last.event,
            eventAt: formatDateTime(last.at),
            sortAt: toTime(last.at),
          };
        })
        .sort((a, b) => b.sortAt - a.sortAt)
        .map(({ sortAt, ...row }) => row),
    }),
  },

  cancel_return_reason: {
    title: "Cancel/Return Reason",
    build: (orders) => {
      const groups = new Map();
      orders
        .filter((order) => ["cancelled", ...RETURN_STATUSES].includes(order.status))
        .forEach((order) => {
          const lastNote = order.adminNotes[order.adminNotes.length - 1];
          const reason = order.returnReason || lastNote?.text || "No reason given";
          const group = groups.get(reason) || { reason, cancelled: 0, returned: 0, orders: 0, amount: 0 };
          group[RETURN_STATUSES.includes(order.status) ? "returned" : order.status] += 1;
          group.orders += 1;
          group.amount += order.total;
          groups.set(reason, group);
        });
      const rows = [...groups.values()]
        .map((row) => ({ ...row, amount: round(row.amount) }))
        .sort((a, b) => b.orders - a.orders);
      return {
        columns: [
          { key: "reason", label: "Reason" },
          { key: "cancelled", label: "Cancelled" },
          { key: "returned", label: "Returned" },
          { key: "orders", label: "Total" },
          { key: "amount", label: "Amount" },
        ],
        rows,
      };
    },
  },

  export: {
    title: "Orders Export",
    build: (orders) => ({
      columns: [
        ["invoice", "Invoice"],
        ["date", "Date"],
        ["customer", "Customer"],
        ["phone", "Phone"],
        ["address", "Address"],
        ["district", "District"],
        ["products", "Products"],
        ["quantity", "Quantity"],
        ["subtotal", "Subtotal"],
        ["deliveryCharge", "Delivery Charge"],
        ["discount", "Discount"],
        ["total", "Total"],
        ["advance", "Advance"],
        ["due", "Due"],
        ["status", "Status"],
        ["paymentStatus", "Payment Status"],
        ["courier", "Courier"],
        ["courierStatus", "Courier Status"],
        ["consignment", "Consignment"],
        ["source", "Source"],
        ["tag", "Order Tag"],
        ["employee", "Employee"],
        ["notes", "Notes"],
      ].map(([key, title]) => ({ key, label: title })),
      rows: orders.map((order) => ({
        invoice: order.orderId,
        date: formatDateTime(order.createdAt),
        customer: order.customerName,
        phone: order.customerPhone,
        address: text(order.meta.customerAddress) || [order.customerArea, order.customerDistrict].filter(Boolean).join(", "),
        district: text(order.customerDistrict),
        products: order.items.map((item) => `${item.qty} x ${item.name}${item.variant ? ` (${item.variant})` : ""}`).join("; "),
        quantity: order.items.reduce((sum, item) => sum + item.qty, 0),
        subtotal: round(order.subtotal),
        deliveryCharge: round(order.deliveryCharge),
        discount: round(order.discount),
        total: round(order.total),
        advance: round(order.advance),
        due: round(order.due),
        status: label(order.status),
        paymentStatus: label(order.meta.paymentStatus || "pending"),
        courier: order.courierName,
        courierStatus: label(order.courierStatus),
        consignment: order.consignment,
        source: order.source,
        tag: label(order.meta.orderTag),
        employee: order.employeeName,
        notes: order.adminNotes.map((note) => note.text).join(" | "),
      })),
    }),
  },
};

const ORDER_REPORT_TYPES = Object.keys(REPORTS);

// Orders that never became a sale; returned orders count only when includeReturns is set.
const NON_SALE_STATUSES = ["cancelled", "incomplete"];

// Courier delivery fee as reported by the courier API, when the response carried one.
const getCourierApiCharge = (meta) => {
  const providers = Object.values(meta.courierIntegration || {});
  return providers.reduce((sum, provider) => {
    const fee = [
      provider?.deliveryCharge,
      provider?.lastStatusResponse?.delivery_charge,
      provider?.lastStatusResponse?.delivery_fee,
      provider?.lastStatusResponse?.data?.delivery_fee,
      provider?.lastResponse?.delivery_charge,
      provider?.lastResponse?.delivery_fee,
    ].find((value) => value !== undefined && value !== null && value !== "");
    return sum + num(fee);
  }, 0);
};

// variationCosts: Map(variationId -> purchasePrice); productCosts: Map(productId -> purchasePrice)
// expenses: [{ categoryName, amount }] for the same period as the orders.
const buildSalesSummary = (rows = [], { variationCosts = new Map(), productCosts = new Map(), expenses = [], includeReturns = false } = {}) => {
  const orders = rows
    .map(toReportOrder)
    .filter((order) => !NON_SALE_STATUSES.includes(order.status) && (includeReturns || !RETURN_STATUSES.includes(order.status)));

  let productTotal = 0;
  let shipping = 0;
  let courierApiCharge = 0;
  let soldUnits = 0;
  let purchaseCost = 0;
  orders.forEach((order) => {
    productTotal += order.subtotal - order.discount;
    shipping += order.deliveryCharge;
    courierApiCharge += getCourierApiCharge(order.meta);
    const rawItems = Array.isArray(order.meta.items) ? order.meta.items : [];
    order.items.forEach((item, index) => {
      soldUnits += item.qty;
      const variantId = Number(rawItems[index]?.variantId);
      const cost = variationCosts.get(variantId) ?? productCosts.get(Number(item.productId)) ?? 0;
      purchaseCost += item.qty * num(cost);
    });
  });

  const isCourierExpense = (expense) => /courier|delivery/i.test(text(expense.categoryName));
  const courierOtherExpense = expenses.filter(isCourierExpense).reduce((sum, item) => sum + num(item.amount), 0);
  const otherExpense = expenses.filter((item) => !isCourierExpense(item)).reduce((sum, item) => sum + num(item.amount), 0);
  const otherIncome = 0;

  const orderTotal = productTotal + shipping;
  const totalCourierCharge = courierApiCharge + courierOtherExpense;
  const afterCourier = orderTotal - totalCourierCharge;
  const salesProfit = afterCourier - purchaseCost;

  return {
    orderCount: orders.length,
    soldUnits,
    productTotal: round(productTotal),
    shipping: round(shipping),
    orderTotal: round(orderTotal),
    courierApiCharge: round(courierApiCharge),
    courierOtherExpense: round(courierOtherExpense),
    totalCourierCharge: round(totalCourierCharge),
    afterCourier: round(afterCourier),
    purchaseCost: round(purchaseCost),
    salesProfit: round(salesProfit),
    otherIncome,
    otherExpense: round(otherExpense),
    netIncome: round(salesProfit + otherIncome - otherExpense),
  };
};

const buildOrderReport = (type, rows = []) => {
  const report = REPORTS[type];
  if (!report) return null;
  const orders = rows.map(toReportOrder);
  return { type, title: report.title, totalOrders: orders.length, ...report.build(orders) };
};

const parseImageList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
};

const imageOf = (value) => (typeof value === "string" ? value : value?.url || value?.file || value?.path || "");

// Packing Product List: order items of the filtered orders grouped by variation or product.
// products: Map(productId -> { name, images, rackNo, variations: [{ Id, stock, purchasePrice, colorImage }] })
// options: groupBy ("variation" | "product"), includeReturns, matchProductIds (Set, only these
// products unless includeOtherProducts), upsales ("exclude" | "only"), createTimeOnly.
const buildPackingList = (rows = [], { products = new Map(), options = {} } = {}) => {
  const groupByProduct = options.groupBy === "product";
  const groups = new Map();

  rows.forEach((row) => {
    const meta = parseMeta(row.note);
    const status = text(row.status).toLowerCase();
    if (!options.includeReturns && RETURN_STATUSES.includes(status)) return;
    const isUpsale = text(meta.orderTag).toLowerCase() === "up sale";
    if (options.upsales === "exclude" && isUpsale) return;
    if (options.upsales === "only" && !isUpsale) return;

    const source = options.createTimeOnly && Array.isArray(meta.originalItems) ? meta.originalItems : meta.items;
    const items = Array.isArray(source) && source.length
      ? source
      : [{ name: row.productName, qty: row.quantity, price: num(row.totalBill) / (num(row.quantity) || 1), image: row.productImage }];

    items.forEach((item) => {
      const productId = Number(item.id ?? item.productId) || null;
      if (options.matchProductIds?.size && !options.includeOtherProducts && !options.matchProductIds.has(productId)) return;
      const variantId = Number(item.variantId) || null;
      const product = products.get(productId);
      const variation = product?.variations?.find((entry) => Number(entry.Id) === variantId);
      const key = groupByProduct
        ? productId ? `p:${productId}` : `n:${text(item.name)}`
        : productId ? `v:${productId}:${variantId || ""}` : `n:${text(item.name)}|${text(item.variant)}`;

      if (!groups.has(key)) {
        const productImages = parseImageList(product?.images).map(imageOf).filter(Boolean);
        const variantCost = num(variation?.purchasePrice);
        const productCost = num(product?.variations?.find((entry) => num(entry.purchasePrice) > 0)?.purchasePrice);
        groups.set(key, {
          product: text(product?.name || item.name) || "Unknown product",
          variant: groupByProduct ? "" : text(item.variant),
          image: (!groupByProduct && variation?.colorImage) || productImages[0] || text(item.image),
          // Product grouping shows the stock of all its variants together.
          availableQuantity: groupByProduct
            ? product?.variations?.length ? product.variations.reduce((sum, entry) => sum + num(entry.stock), 0) : null
            : variation ? num(variation.stock) : null,
          rackNo: text(product?.rackNo),
          unitCost: groupByProduct ? productCost : variantCost || productCost,
          orderQuantity: 0,
          orderIds: new Set(),
          amount: 0,
          discount: 0,
          byStatus: new Map(),
        });
      }
      const group = groups.get(key);
      const qty = num(item.qty) || 1;
      group.orderQuantity += qty;
      group.orderIds.add(row.Id);
      group.amount += qty * num(item.price);
      group.discount += num(item.disc);
      const statusGroup = group.byStatus.get(status) || { quantity: 0, orderIds: new Set(), amount: 0 };
      statusGroup.quantity += qty;
      statusGroup.orderIds.add(row.Id);
      statusGroup.amount += qty * num(item.price) - num(item.disc);
      group.byStatus.set(status, statusGroup);
    });
  });

  return [...groups.values()]
    .map(({ orderIds, unitCost, byStatus, ...group }) => ({
      ...group,
      // Per order status: units, number of orders and amount after discount.
      statuses: Object.fromEntries(
        [...byStatus].map(([key, value]) => [
          key,
          { quantity: value.quantity, orders: value.orderIds.size, amount: round(value.amount) },
        ]),
      ),
      orderCount: orderIds.size,
      amount: round(group.amount),
      discount: round(group.discount),
      afterDiscount: round(group.amount - group.discount),
      productCost: round(unitCost * group.orderQuantity),
    }))
    .sort((a, b) => b.orderQuantity - a.orderQuantity);
};

module.exports = { ORDER_REPORT_TYPES, buildOrderReport, buildSalesSummary, buildPackingList };
