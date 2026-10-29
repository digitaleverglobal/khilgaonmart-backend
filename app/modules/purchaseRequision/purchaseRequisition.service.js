const { Op } = require("sequelize"); // Ensure Op is imported
const paginationHelpers = require("../../../helpers/paginationHelper");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const {
  PurchaseRequisitionSearchableFields,
} = require("./purchaseRequisition.constants");
const {
  resolveApprovalNotificationMessage,
} = require("../../../shared/approvalNotification");
const parseVariants = require("../../../shared/parseVariants");

const PurchaseRequisition = db.purchaseRequisition;
const Product = db.product;
const Asset = db.asset;
const Variation = db.variation;
const Notification = db.notification;
const User = db.user;
const Supplier = db.supplier;
const Warehouse = db.warehouse;
const CashInOut = db.cashInOut;
const SupplierHistory = db.supplierHistory;
const PURCHASE_REQUISITION_STATUS_UPDATE_ROLES = [
  "superAdmin",
  "admin",
  "accountant",
  "inventor",
];

const buildPurchaseRequisitionIncludes = ({ includeSupplier = true } = {}) => {
  const includes = [];

  if (includeSupplier && Supplier) {
    includes.push({
      model: Supplier,
      as: "supplier",
      attributes: ["Id", "name"],
    });
  }

  if (Warehouse) {
    includes.push({
      model: Warehouse,
      as: "warehouse",
      attributes: ["Id", "name"],
    });
  }

  if (Asset) {
    includes.push({
      model: Asset,
      as: "asset",
      attributes: ["Id", "name"],
    });
  }

  return includes;
};

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  if (!text || ["undefined", "null"].includes(text.toLowerCase())) {
    return null;
  }

  return text;
};

const normalizeOptionalId = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const id = Number(value);
  return Number.isNaN(id) ? null : id;
};

const normalizePaymentDetails = ({ paymentMode, bankName, bankAccount }) => {
  const normalizedPaymentMode = String(paymentMode || "").trim();
  const isBank = normalizedPaymentMode === "Bank";
  const normalizedBankName = String(bankName || "").trim();
  const normalizedBankAccount =
    bankAccount !== undefined &&
    bankAccount !== null &&
    String(bankAccount).trim() !== ""
      ? Number(bankAccount)
      : null;

  if (
    isBank &&
    normalizedBankAccount !== null &&
    Number.isNaN(normalizedBankAccount)
  ) {
    throw new ApiError(400, "Invalid bank account");
  }

  return {
    paymentMode: normalizedPaymentMode || null,
    bankName: isBank ? normalizedBankName || null : null,
    bankAccount: isBank ? normalizedBankAccount : null,
  };
};

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

const getBulkItems = (data = {}) => {
  const items = parseItems(data.items);
  if (!items.length) return [];

  const { items: _items, ...commonFields } = data;
  return items.map((item) => ({
    ...commonFields,
    ...item,
  }));
};

const summarizeRequisitionItems = (items = []) => ({
  quantity: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
  amount: items.reduce((total, item) => total + Number(item.amount || 0), 0),
});

const incrementProductStock = async (
  { productId, quantity, purchasePrice },
  options = {},
) => {
  const normalizedProductId = normalizeOptionalId(productId);
  const normalizedQuantity = Number(quantity || 0);

  if (!normalizedProductId || normalizedQuantity <= 0 || !Variation) return;

  const existingVariation = await Variation.findOne({
    where: { productId: normalizedProductId },
    order: [["Id", "ASC"]],
    transaction: options.transaction,
  });

  if (existingVariation) {
    const nextPayload = {
      stock: Number(existingVariation.stock || 0) + normalizedQuantity,
      availability: "in stock",
    };

    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      nextPayload.purchasePrice = Number(purchasePrice);
    }

    await existingVariation.update(nextPayload, {
      transaction: options.transaction,
    });
    return;
  }

  await Variation.create(
    {
      productId: normalizedProductId,
      purchasePrice:
        purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== ""
          ? Number(purchasePrice)
          : null,
      stock: normalizedQuantity,
      availability: "in stock",
    },
    { transaction: options.transaction },
  );
};

const resolveRequisitionItem = async (
  { productId, assetId, assetName, existing = null },
  options = {},
) => {
  const normalizedProductId = normalizeOptionalId(productId);
  const normalizedAssetId = normalizeOptionalId(assetId);
  const normalizedAssetName = normalizeOptionalText(assetName);

  if (normalizedProductId) {
    const productData = await Product.findOne({
      where: { Id: normalizedProductId },
      transaction: options.transaction,
    });

    if (!productData) {
      throw new ApiError(404, "Product not found");
    }

    return {
      name: productData.name,
      productId: normalizedProductId,
      assetId: null,
    };
  }

  if (normalizedAssetId) {
    const assetData = await Asset.findOne({
      where: { Id: normalizedAssetId },
      transaction: options.transaction,
    });

    if (!assetData) {
      throw new ApiError(404, "Asset not found");
    }

    return {
      name: assetData.name,
      productId: null,
      assetId: normalizedAssetId,
    };
  }

  if (normalizedAssetName) {
    const [assetData] = await Asset.findOrCreate({
      where: { name: normalizedAssetName },
      defaults: { name: normalizedAssetName },
      transaction: options.transaction,
    });

    return {
      name: assetData.name,
      productId: null,
      assetId: assetData.Id,
    };
  }

  if (existing) {
    return {
      name: existing.name,
      productId: existing.productId || null,
      assetId: existing.assetId || null,
    };
  }

  throw new ApiError(400, "Product or asset is required");
};

const insertIntoDB = async (data = {}) => {
  const bulkItems = getBulkItems(data);
  if (bulkItems.length > 1) {
    return insertBulkIntoDB(data, bulkItems);
  }

  const {
    quantity,
    amount,
    variants,
    productId,
    assetId,
    assetName,
    newAssetName,
    name,
    userId,
    bookId,
    note,
    date,
    file,
    procurement,
    supplierId,
    warehouseId,
    paymentMode,
    bankName,
    bankAccount,
  } = data;

  const incomingVariants = parseVariants(variants);
  const paymentDetails = normalizePaymentDetails({
    paymentMode,
    bankName,
    bankAccount,
  });

  const finalStatus = "Pending";

  return db.sequelize.transaction(async (t) => {
    const item = await resolveRequisitionItem(
      {
        productId,
        assetId,
        assetName: assetName || newAssetName || name,
      },
      { transaction: t },
    );

    const payload = {
      name: item.name,
      procurement: procurement || null,
      quantity: Number(quantity),
      amount: Number(amount || 0),
      bookId: bookId || null,
      ...paymentDetails,
      status: finalStatus, // সব নতুন রিকুয়েস্ট হবে Pending, পরে update route থেকে Approved/Completed করা যাবে
      note: finalStatus === "Approved" ? null : note || null,
      date: date,
      variants: incomingVariants,
      supplierId,
      warehouseId,
      productId: item.productId,
      assetId: item.assetId,
      file: file || null,
    };

    const result = await PurchaseRequisition.create(payload, {
      transaction: t,
    });

    await incrementProductStock(
      {
        productId: item.productId,
        quantity: payload.quantity,
        purchasePrice: data.price || data.purchasePrice,
      },
      { transaction: t },
    );

    const users = await User.findAll({
      attributes: ["Id", "role"],
      where: {
        Id: { [Op.ne]: userId },
        role: { [Op.in]: ["superAdmin", "admin", "inventor"] },
      },
      transaction: t,
    });

    if (users.length) {
      const message = resolveApprovalNotificationMessage({
        status: finalStatus,
        note,
        date,
        approvedMessage: "Product purchase requision request approved",
        fallbackMessage: "Product purchase requisition request",
      });

      await Promise.all(
        users.map((u) =>
          Notification.create(
            {
              userId: u.Id,
              title: "Purchase requisition updated",
              message,
              type: "purchase_requisition",
              url: "/#page=purchase&purchasePage=purchase_list",
            },
            { transaction: t },
          ),
        ),
      );
    }

    return result;
  });
};

const insertBulkIntoDB = async (data = {}, preparedItems = null) => {
  const items = preparedItems || getBulkItems(data);
  if (!items.length) return insertIntoDB(data);

  const firstItem = items[0] || {};
  const userId = data.userId ?? firstItem.userId;
  const bookId = data.bookId ?? firstItem.bookId;
  const note = data.note ?? firstItem.note;
  const date = data.date ?? firstItem.date;
  const file = data.file ?? firstItem.file;
  const procurement = data.procurement ?? firstItem.procurement;
  const supplierId = data.supplierId ?? firstItem.supplierId;
  const warehouseId = data.warehouseId ?? firstItem.warehouseId;
  const paymentMode = data.paymentMode ?? firstItem.paymentMode;
  const bankName = data.bankName ?? firstItem.bankName;
  const bankAccount = data.bankAccount ?? firstItem.bankAccount;

  const paymentDetails = normalizePaymentDetails({
    paymentMode,
    bankName,
    bankAccount,
  });
  const finalStatus = "Pending";

  return db.sequelize.transaction(async (t) => {
    const normalizedItems = [];

    for (const item of items) {
      const resolvedItem = await resolveRequisitionItem(
        {
          productId: item.productId,
          assetId: item.assetId,
          assetName: item.assetName || item.newAssetName || item.name,
        },
        { transaction: t },
      );
      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) {
        throw new ApiError(400, "Quantity must be greater than 0 for every item");
      }

      normalizedItems.push({
        name: resolvedItem.name,
        productId: resolvedItem.productId,
        assetId: resolvedItem.assetId,
        quantity,
        amount: Number(item.amount || 0),
        price: Number(item.price || item.purchasePrice || 0),
        discount: Number(item.discount || 0),
        variants: parseVariants(item.variants),
      });
    }

    const summary = summarizeRequisitionItems(normalizedItems);
    const result = await PurchaseRequisition.create(
      {
        name: normalizedItems.map((item) => item.name).join(", "),
        procurement: procurement || null,
        quantity: summary.quantity,
        amount: summary.amount,
        bookId: bookId || null,
        ...paymentDetails,
        status: finalStatus,
        note: finalStatus === "Approved" ? null : note || null,
        date,
        variants: [],
        items: normalizedItems,
        supplierId,
        warehouseId,
        productId: normalizedItems[0]?.productId || null,
        assetId: normalizedItems[0]?.assetId || null,
        file: file || null,
      },
      { transaction: t },
    );

    await Promise.all(
      normalizedItems.map((item) =>
        incrementProductStock(
          {
            productId: item.productId,
            quantity: item.quantity,
            purchasePrice: item.price,
          },
          { transaction: t },
        ),
      ),
    );

    const users = await User.findAll({
      attributes: ["Id", "role"],
      where: {
        Id: { [Op.ne]: userId },
        role: { [Op.in]: ["superAdmin", "admin", "inventor"] },
      },
      transaction: t,
    });

    if (users.length) {
      const message = resolveApprovalNotificationMessage({
        status: finalStatus,
        note,
        date,
        approvedMessage: "Product purchase requision request approved",
        fallbackMessage: "Product purchase requisition request",
      });

      await Promise.all(
        users.map((u) =>
          Notification.create(
            {
              userId: u.Id,
              title: "Purchase requisition updated",
              message,
              type: "purchase_requisition",
              url: "/#page=purchase&purchasePage=purchase_list",
            },
            { transaction: t },
          ),
        ),
      );
    }

    return result;
  });
};

const getAllFromDB = async (filters, options) => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);

  const { searchTerm, startDate, endDate, ...otherFilters } = filters;

  const andConditions = [];

  // Search by real table columns. MySQL uses LIKE rather than ILIKE.
  if (searchTerm && searchTerm.trim()) {
    andConditions.push({
      [Op.or]: PurchaseRequisitionSearchableFields.map((field) => ({
        [field]: { [Op.like]: `%${searchTerm.trim()}%` },
      })),
    });
  }

  // ✅ Exact filters
  if (Object.keys(otherFilters).length) {
    andConditions.push(
      ...Object.entries(otherFilters).map(([key, value]) => ({
        [key]: { [Op.eq]: value },
      })),
    );
  }

  // ✅ Date range
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

  // ✅ paginated data
  const data = await PurchaseRequisition.findAll({
    where: whereConditions,
    offset: skip,
    limit,
    include: buildPurchaseRequisitionIncludes(),
    paranoid: true,
    order:
      options.sortBy && options.sortOrder
        ? [[options.sortBy, options.sortOrder.toUpperCase()]]
        : [["createdAt", "DESC"]],
  });

  // ✅ total count + total quantity (same filters)
  const [count, totalQuantity] = await Promise.all([
    PurchaseRequisition.count({ where: whereConditions }),
    PurchaseRequisition.sum("quantity", { where: whereConditions }),
  ]);

  return {
    meta: {
      count, // total filtered records
      totalQuantity: totalQuantity || 0, // total filtered quantity
      page,
      limit,
    },
    data,
  };
};

const getDataById = async (id) => {
  const result = await PurchaseRequisition.findOne({
    where: {
      Id: id,
    },
    include: buildPurchaseRequisitionIncludes(),
  });

  return result;
};

const deleteIdFromDB = async (id) => {
  const result = await PurchaseRequisition.destroy({
    where: {
      Id: id,
    },
  });

  return result;
};

const updateBulkOneFromDB = async (id, payload, preparedItems = []) => {
  const {
    note,
    date,
    status,
    file,
    procurement,
    userId,
    supplierId,
    warehouseId,
    bookId,
    paymentMode,
    bankName,
    bankAccount,
    actorRole,
  } = payload;

  const todayStr = new Date().toISOString().slice(0, 10);
  const inputDateStr = String(date || "").slice(0, 10);

  const existing = await PurchaseRequisition.findOne({
    where: { Id: id },
    attributes: [
      "Id",
      "note",
      "status",
      "name",
      "productId",
      "assetId",
      "bookId",
      "paymentMode",
      "bankName",
      "bankAccount",
      "quantity",
      "amount",
      "date",
      "supplierId",
      "warehouseId",
      "items",
    ],
  });

  if (!existing) return 0;

  const finalBookId = normalizeOptionalId(bookId) || existing.bookId || null;
  const finalSupplierId =
    normalizeOptionalId(supplierId) || existing.supplierId || null;
  const finalWarehouseId =
    normalizeOptionalId(warehouseId) || existing.warehouseId || null;
  const finalDate = inputDateStr || existing.date || undefined;
  const paymentDetails = normalizePaymentDetails({
    paymentMode: paymentMode === undefined ? existing.paymentMode : paymentMode,
    bankName: bankName === undefined ? existing.bankName : bankName,
    bankAccount: bankAccount === undefined ? existing.bankAccount : bankAccount,
  });

  const oldNote = String(existing.note || "").trim();
  const newNote = String(note || "").trim();
  const noteTriggersPending = Boolean(newNote) && newNote !== oldNote;
  const dateTriggersPending =
    Boolean(inputDateStr) && inputDateStr !== todayStr;
  const inputStatus = String(status || "").trim();

  let finalStatus = existing.status || "Pending";
  const isPrivileged =
    PURCHASE_REQUISITION_STATUS_UPDATE_ROLES.includes(actorRole);
  if (isPrivileged) {
    finalStatus = inputStatus || finalStatus;
  } else if (dateTriggersPending || noteTriggersPending) {
    finalStatus = "Pending";
  } else {
    finalStatus = inputStatus || finalStatus;
  }

  let normalizedItems = parseItems(existing.items);

  if (preparedItems.length > 0) {
    normalizedItems = [];
    for (const item of preparedItems) {
      const resolvedItem = await resolveRequisitionItem({
        productId: item.productId,
        assetId: item.assetId,
        assetName: item.assetName || item.newAssetName || item.name,
      });
      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) {
        throw new ApiError(400, "Quantity must be greater than 0 for every item");
      }
      normalizedItems.push({
        name: resolvedItem.name,
        productId: resolvedItem.productId,
        assetId: resolvedItem.assetId,
        quantity,
        amount: Number(item.amount || 0),
        variants: parseVariants(item.variants),
      });
    }
  }

  const summary = summarizeRequisitionItems(normalizedItems);
  const data = {
    name: normalizedItems.map((item) => item.name).join(", "),
    quantity: summary.quantity,
    amount: summary.amount,
    bookId: finalBookId,
    ...paymentDetails,
    variants: [],
    items: normalizedItems,
    note: finalStatus === "Approved" ? null : newNote || null,
    status: finalStatus,
    date: finalDate,
    procurement,
    file: file || null,
    supplierId: finalSupplierId,
    warehouseId: finalWarehouseId,
    productId: normalizedItems[0]?.productId || existing.productId,
    assetId: normalizedItems[0]?.assetId || existing.assetId,
  };

  return db.sequelize.transaction(async (t) => {
    if (finalStatus === "Completed" && existing.status !== "Completed") {
      const resolvedSupplierId = finalSupplierId;
      const resolvedAmount = summary.amount;
      const resolvedDate = finalDate || new Date().toISOString().slice(0, 10);
      const itemName = data.name || existing.name;

      if (resolvedSupplierId && resolvedAmount > 0) {
        await SupplierHistory.create(
          {
            supplierId: resolvedSupplierId,
            bookId: finalBookId,
            amount: resolvedAmount,
            status: "Paid",
            date: resolvedDate,
            note: `Purchase requisition completed: ${itemName}`,
            file: file || null,
          },
          { transaction: t },
        );

        await CashInOut.create(
          {
            supplierId: resolvedSupplierId,
            bookId: finalBookId,
            ...paymentDetails,
            paymentStatus: "CashOut",
            amount: resolvedAmount,
            paymentMode,
            bankName,
            bankAccount,
            status: "Active",
            category: "Purchase Product",
            date: resolvedDate,
            note: `Purchase requisition completed: ${itemName}`,
            file: file || null,
          },
          { transaction: t },
        );
      }
    }

    const [updatedCount] = await PurchaseRequisition.update(data, {
      where: { Id: id },
      transaction: t,
    });

    const users = await User.findAll({
      attributes: ["Id", "role"],
      where: {
        Id: { [Op.ne]: userId },
        role: { [Op.in]: ["superAdmin", "admin"] },
      },
      transaction: t,
    });

    if (!users.length) return updatedCount;

    const message = resolveApprovalNotificationMessage({
      status: finalStatus,
      note: newNote,
      date: inputDateStr,
      approvedMessage: "Product purchase requision request approved",
      fallbackMessage: "Product purchase requisition request",
    });

    await Promise.all(
      users.map((u) =>
        Notification.create(
          {
            userId: u.Id,
            title: "Purchase requisition updated",
            message,
            type: "purchase_requisition",
            url: "/#page=purchase&purchasePage=purchase_list",
          },
          { transaction: t },
        ),
      ),
    );

    return updatedCount;
  });
};

const updateOneFromDB = async (id, payload) => {
  const incomingBulkItems = getBulkItems(payload);
  if (incomingBulkItems.length > 1) {
    return updateBulkOneFromDB(id, payload, incomingBulkItems);
  }

  const {
    quantity,
    productId,
    assetId,
    assetName,
    newAssetName,
    name,
    variants,
    note,
    date,
    status,
    file,
    procurement,
    userId,
    supplierId,
    warehouseId,
    amount,
    bookId,
    paymentMode,
    bankName,
    bankAccount,
    actorRole,
  } = payload;

  const incomingVariants = parseVariants(variants);

  const todayStr = new Date().toISOString().slice(0, 10);
  const inputDateStr = String(date || "").slice(0, 10);

  // ✅ আগে পুরোনো ডাটা আনো (note পরিবর্তন ধরার জন্য)
  const existing = await PurchaseRequisition.findOne({
    where: { Id: id },
    attributes: [
      "Id",
      "note",
      "status",
      "name",
      "productId",
      "assetId",
      "bookId",
      "paymentMode",
      "bankName",
      "bankAccount",
      "quantity",
      "amount",
      "date",
      "supplierId",
      "warehouseId",
      "items",
    ],
  });

  if (!existing) return 0;

  if (parseItems(existing.items).length > 0) {
    return updateBulkOneFromDB(id, payload, incomingBulkItems);
  }

  const finalBookId = normalizeOptionalId(bookId) || existing.bookId || null;
  const finalQuantity =
    quantity === undefined || quantity === null || quantity === ""
      ? existing.quantity
      : Number(quantity);
  const finalAmount =
    amount === undefined || amount === null || amount === ""
      ? Number(existing.amount || 0)
      : Number(amount || 0);
  const finalSupplierId =
    normalizeOptionalId(supplierId) || existing.supplierId || null;
  const finalWarehouseId =
    normalizeOptionalId(warehouseId) || existing.warehouseId || null;
  const finalDate = inputDateStr || existing.date || undefined;
  const paymentDetails = normalizePaymentDetails({
    paymentMode: paymentMode === undefined ? existing.paymentMode : paymentMode,
    bankName: bankName === undefined ? existing.bankName : bankName,
    bankAccount: bankAccount === undefined ? existing.bankAccount : bankAccount,
  });

  const oldNote = String(existing.note || "").trim();
  const newNote = String(note || "").trim();

  // ✅ newNote খালি না হলে + oldNote থেকে আলাদা হলে => pending trigger
  const noteTriggersPending = Boolean(newNote) && newNote !== oldNote;

  // ✅ today না হলে pending trigger (date না পাঠালে trigger হবে না)
  const dateTriggersPending =
    Boolean(inputDateStr) && inputDateStr !== todayStr;

  const inputStatus = String(status || "").trim();

  let finalStatus = existing.status || "Pending";

  const isPrivileged =
    PURCHASE_REQUISITION_STATUS_UPDATE_ROLES.includes(actorRole);

  if (isPrivileged) {
    // ✅ superAdmin/admin: যা পাঠাবে সেটাই
    finalStatus = inputStatus || finalStatus;
  } else {
    // ✅ others: today date না হলে বা new note হলে Pending override
    if (dateTriggersPending || noteTriggersPending) {
      finalStatus = "Pending";
    } else {
      // ✅ otherwise: status পাঠালে সেটাই, না পাঠালে আগেরটা
      finalStatus = inputStatus || finalStatus;
    }
  }

  const data = {
    quantity: finalQuantity,
    amount: finalAmount,
    bookId: finalBookId,
    ...paymentDetails,
    variants: incomingVariants,
    note: finalStatus === "Approved" ? null : newNote || null,
    status: finalStatus,
    date: finalDate,
    procurement,
    file: file || null,
    supplierId: finalSupplierId,
    warehouseId: finalWarehouseId,
  };

  return db.sequelize.transaction(async (t) => {
    const item = await resolveRequisitionItem(
      {
        productId,
        assetId,
        assetName: assetName || newAssetName || name,
        existing,
      },
      { transaction: t },
    );

    data.name = item.name;
    data.productId = item.productId;
    data.assetId = item.assetId;

    if (finalStatus === "Completed" && existing.status !== "Completed") {
      const resolvedSupplierId = finalSupplierId;
      const resolvedAmount = finalAmount;
      const resolvedDate = finalDate || new Date().toISOString().slice(0, 10);
      const itemName = data.name || existing.name;

      if (resolvedSupplierId && resolvedAmount > 0) {
        // ১. SupplierHistory — মাল পেলাম এবং সাথে সাথে cash দিলাম (Paid)
        await SupplierHistory.create(
          {
            supplierId: resolvedSupplierId,
            bookId: finalBookId,
            amount: resolvedAmount,
            status: "Paid",
            date: resolvedDate,
            note: `Purchase requisition completed: ${itemName}`,
            file: file || null,
          },
          { transaction: t },
        );

        // ২. CashInOut — book থেকে cash বের হলো (CashOut)
        await CashInOut.create(
          {
            supplierId: resolvedSupplierId,
            bookId: finalBookId,
            ...paymentDetails,
            paymentStatus: "CashOut",
            amount: resolvedAmount,
            paymentMode,
            bankName,
            bankAccount,
            status: "Active",
            category: "Purchase Product",
            date: resolvedDate,
            note: `Purchase requisition completed: ${itemName}`,
            file: file || null,
          },
          { transaction: t },
        );
      }
    }

    const [updatedCount] = await PurchaseRequisition.update(data, {
      where: {
        Id: id,
      },
      transaction: t,
    });

    const users = await User.findAll({
      attributes: ["Id", "role"],
      where: {
        Id: { [Op.ne]: userId }, // sender বাদ
        role: { [Op.in]: ["superAdmin", "admin"] }, // তোমার DB অনুযায়ী ঠিক করো
      },
    });

    if (!users.length) return updatedCount;

    const message = resolveApprovalNotificationMessage({
      status: finalStatus,
      note: newNote,
      date: inputDateStr,
      approvedMessage: "Product purchase requision request approved",
      fallbackMessage: "Product purchase requisition request",
    });

    await Promise.all(
      users.map((u) =>
        Notification.create({
          userId: u.Id,
          title: "Purchase requisition updated",
          message,
          type: "purchase_requisition",
          url: "/#page=purchase&purchasePage=purchase_list",
        }),
      ),
    );

    return updatedCount;
  });
};

const getAllFromDBWithoutQuery = async () => {
  const result = await PurchaseRequisition.findAll({
    include: buildPurchaseRequisitionIncludes({ includeSupplier: false }),
    paranoid: true,
    order: [["createdAt", "DESC"]],
  });

  return result;
};

const PurchaseRequisitionService = {
  getAllFromDB,
  insertIntoDB,
  deleteIdFromDB,
  updateOneFromDB,
  getDataById,
  getAllFromDBWithoutQuery,
};

module.exports = PurchaseRequisitionService;
