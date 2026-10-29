const db = require("../db/db");
const { DataTypes } = require("sequelize");

// =====================
// Define models
// =====================

// Core
db.user = require("../app/modules/user/user.model")(db.sequelize, DataTypes);
db.rolePermission =
  require("../app/modules/rolePermission/rolePermission.model")(
    db.sequelize,
    DataTypes,
  );
db.userLogHistory =
  require("../app/modules/userLogHistory/userLogHistory.model")(
    db.sequelize,
    DataTypes,
  );
db.notification = require("../app/modules/notification/notification.model")(
  db.sequelize,
  DataTypes,
);

// Products
db.product = require("../app/modules/product/product.model")(
  db.sequelize,
  DataTypes,
);
db.variation = require("../app/modules/variation/variation.model")(
  db.sequelize,
  DataTypes,
);
db.category = require("../app/modules/category/category.model")(
  db.sequelize,
  DataTypes,
);
db.subcategory = require("../app/modules/subcategory/subcategory.model")(
  db.sequelize,
  DataTypes,
);
db.childcategory = require("../app/modules/childcategory/childcategory.model")(
  db.sequelize,
  DataTypes,
);
db.brand = require("../app/modules/brand/brand.model")(db.sequelize, DataTypes);
db.color = require("../app/modules/color/color.model")(db.sequelize, DataTypes);
db.attribute = require("../app/modules/attribute/attribute.model")(
  db.sequelize,
  DataTypes,
);
db.review = require("../app/modules/review/review.model")(
  db.sequelize,
  DataTypes,
);

// Supplier
db.supplier = require("../app/modules/supplier/supplier.model")(
  db.sequelize,
  DataTypes,
);
db.supplierHistory =
  require("../app/modules/supplierHistory/supplierHistory.model")(
    db.sequelize,
    DataTypes,
  );

// Purchase
db.purchaseRequisition =
  require("../app/modules/purchaseRequision/purchaseRequisition.model")(
    db.sequelize,
    DataTypes,
  );

// Expenses
db.expenseCategory = require("../app/modules/expense/expenseCategory.model")(
  db.sequelize,
  DataTypes,
);
db.expense = require("../app/modules/expense/expense.model")(
  db.sequelize,
  DataTypes,
);

// Orders
db.order = require("../app/modules/order/order.model")(db.sequelize, DataTypes);
db.orderFraudCheck = require("../app/modules/order/orderFraudCheck.model")(
  db.sequelize,
  DataTypes,
);

// Serialize draft/final writes across API processes, including invoice allocation.
db.orderWriteLock = db.sequelize.define("OrderWriteLock", {
  Id: { type: DataTypes.INTEGER, primaryKey: true },
}, { timestamps: false });

// Charge Settings (4 sub-models)
db.codCharge = require("../app/modules/chargeSetting/codCharge.model")(
  db.sequelize,
  DataTypes,
);
db.codChange = require("../app/modules/chargeSetting/codChange.model")(
  db.sequelize,
  DataTypes,
);
db.deliveryCharge =
  require("../app/modules/chargeSetting/deliveryCharge.model")(
    db.sequelize,
    DataTypes,
  );
db.deliveryAdvance =
  require("../app/modules/chargeSetting/deliveryAdvance.model")(
    db.sequelize,
    DataTypes,
  );

// Website / Settings
db.ipBlock = require("../app/modules/ipBlock/ipBlock.model")(
  db.sequelize,
  DataTypes,
);
db.siteSetting = require("../app/modules/siteSetting/siteSetting.model")(
  db.sequelize,
  DataTypes,
);
db.orderStatus = require("../app/modules/orderStatus/orderStatus.model")(
  db.sequelize,
  DataTypes,
);
db.deliveryArea = require("../app/modules/deliveryArea/deliveryArea.model")(
  db.sequelize,
  DataTypes,
);
db.customer = require("../app/modules/customer/customer.model")(
  db.sequelize,
  DataTypes,
);
db.rewardTransaction = require("../app/modules/reward/rewardTransaction.model")(
  db.sequelize,
  DataTypes,
);
db.websitePage = require("../app/modules/websitePage/websitePage.model")(
  db.sequelize,
  DataTypes,
);

// Marketing / API
db.tagManager = require("../app/modules/tagManager/tagManager.model")(
  db.sequelize,
  DataTypes,
);
db.facebookPixel = require("../app/modules/facebookPixel/facebookPixel.model")(
  db.sequelize,
  DataTypes,
);
db.tiktokPixel = require("../app/modules/tiktokPixel/tiktokPixel.model")(
  db.sequelize,
  DataTypes,
);
db.googleAds = require("../app/modules/googleAds/googleAds.model")(
  db.sequelize,
  DataTypes,
);
db.bannerCategory =
  require("../app/modules/bannerCategory/bannerCategory.model")(
    db.sequelize,
    DataTypes,
  );
db.banner = require("../app/modules/banner/banner.model")(
  db.sequelize,
  DataTypes,
);
db.couponCode = require("../app/modules/couponCode/couponCode.model")(
  db.sequelize,
  DataTypes,
);
db.visitorStat = require("../app/modules/visitorStat/visitorStat.model")(
  db.sequelize,
  DataTypes,
);
db.landingPage = require("../app/modules/landingPage/landingPage.model")(
  db.sequelize,
  DataTypes,
);
db.comboOffer = require("../app/modules/comboOffer/comboOffer.model")(
  db.sequelize,
  DataTypes,
);

// =====================
// Associations
// =====================

db.user.hasMany(db.notification, { foreignKey: "userId", as: "notifications" });
db.notification.belongsTo(db.user, { foreignKey: "userId", as: "user" });

db.order.hasOne(db.orderFraudCheck, {
  foreignKey: "orderId",
  as: "fraudCheck",
});
db.orderFraudCheck.belongsTo(db.order, {
  foreignKey: "orderId",
  as: "order",
});
db.user.hasMany(db.order, {
  foreignKey: "assignedEmployeeId",
  as: "assignedOrders",
});
db.order.belongsTo(db.user, {
  foreignKey: "assignedEmployeeId",
  as: "assignedEmployee",
});
db.user.hasMany(db.order, {
  foreignKey: "assignedById",
  as: "assignedByOrders",
});
db.order.belongsTo(db.user, {
  foreignKey: "assignedById",
  as: "assignedByUser",
});

db.expenseCategory.hasMany(db.expense, {
  foreignKey: "categoryId",
  as: "expenses",
});
db.expense.belongsTo(db.expenseCategory, {
  foreignKey: "categoryId",
  as: "category",
});

// Product <-> Variation
db.product.hasMany(db.variation, { foreignKey: "productId", as: "variations" });
db.variation.belongsTo(db.product, { foreignKey: "productId", as: "product" });

// Supplier <-> SupplierHistory
db.supplier.hasMany(db.supplierHistory, { foreignKey: "supplierId" });
db.supplierHistory.belongsTo(db.supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

// Banner <-> BannerCategory
db.bannerCategory.hasMany(db.banner, {
  foreignKey: "categoryId",
  as: "banners",
});
db.banner.belongsTo(db.bannerCategory, {
  foreignKey: "categoryId",
  as: "category",
});

// Supplier <-> PurchaseRequisition
db.supplier.hasMany(db.purchaseRequisition, { foreignKey: "supplierId" });
db.purchaseRequisition.belongsTo(db.supplier, {
  foreignKey: "supplierId",
  as: "supplier",
});

// =====================
// Sync helpers
// =====================

const ensureUserRoleColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.user.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  const definition = {
    type: DataTypes.STRING(64),
    allowNull: true,
    defaultValue: "user",
  };
  if (!tableDefinition.role) {
    await queryInterface.addColumn(tableName, "role", definition);
    return;
  }
  await queryInterface.changeColumn(tableName, "role", definition);
};

const ensureUserStatusColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.user.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.status) {
    await queryInterface.addColumn(tableName, "status", {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "Active",
    });
  }
  await db.sequelize.query(
    `UPDATE \`${tableName}\` SET status = 'Active' WHERE status IS NULL OR TRIM(status) = ''`,
  );
};

const ensureUserOrderDistributionColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.user.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.orderDistribution) {
    await queryInterface.addColumn(tableName, "orderDistribution", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
};

const ensureUserDocumentColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.user.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  const maybeAddColumn = async (columnName) => {
    if (!tableDefinition[columnName]) {
      await queryInterface.addColumn(tableName, columnName, {
        type: DataTypes.STRING,
        allowNull: true,
      });
    }
  };
  await maybeAddColumn("idCard");
  await maybeAddColumn("cv");
  await maybeAddColumn("guardianPhoto");
  await maybeAddColumn("guardianIdCard");
};

const hasColumn = (tableDefinition, columnName) =>
  Object.keys(tableDefinition).some(
    (existingName) => existingName.toLowerCase() === columnName.toLowerCase(),
  );

const ensureSupplierStatusNoteColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.supplier.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.note) {
    await queryInterface.addColumn(tableName, "note", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!tableDefinition.status) {
    await queryInterface.addColumn(tableName, "status", {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: "Active",
    });
  }
};

const ensureSupplierHistoryColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.supplierHistory.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("supplierId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("paymentTitle", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("due", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("method", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("sender", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("transactionId", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("description", { type: DataTypes.TEXT, allowNull: true });
};

const ensureSubcategoryTableCompatibility = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.subcategory.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);

  if (!hasColumn(tableDefinition, "status")) {
    await queryInterface.addColumn(tableName, "status", {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "Active",
    });
  }
  if (!hasColumn(tableDefinition, "image")) {
    await queryInterface.addColumn(tableName, "image", {
      type: DataTypes.STRING(500),
      allowNull: true,
    });
  }

  const tables = await queryInterface.showAllTables();
  const hasLegacyTable = tables.some(
    (name) => String(name) === "Subcategories",
  );
  if (!hasLegacyTable || tableName === "Subcategories") return;

  await db.sequelize.query(`
    INSERT IGNORE INTO \`SubCategories\`
      (\`Id\`, \`name\`, \`categoryId\`, \`status\`, \`deletedAt\`, \`createdAt\`, \`updatedAt\`)
    SELECT
      \`Id\`,
      \`name\`,
      \`categoryId\`,
      COALESCE(\`status\`, 'Active'),
      \`deletedAt\`,
      \`createdAt\`,
      \`updatedAt\`
    FROM \`Subcategories\`
  `);
};

const ensureChildcategoryImageColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.childcategory.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!hasColumn(tableDefinition, "image")) {
    await queryInterface.addColumn(tableName, "image", {
      type: DataTypes.STRING(500),
      allowNull: true,
    });
  }
};

const ensureProductStatusNoteColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.product.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("slug", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("sku", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("subcategoryId", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
  });
  await maybeAdd("childcategoryId", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
  });
  await maybeAdd("brandId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("productVideo", {
    type: DataTypes.STRING(500),
    allowNull: true,
  });
  await maybeAdd("advanceAmount", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  await maybeAdd("rackNo", { type: DataTypes.STRING(64), allowNull: true });
  await maybeAdd("stockAlert", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
  });
  await maybeAdd("description", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("shortDescription", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("metaTitle", { type: DataTypes.STRING(500), allowNull: true });
  await maybeAdd("metaKeyword", {
    type: DataTypes.STRING(500),
    allowNull: true,
  });
  await maybeAdd("metaDescription", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("giftTitle", { type: DataTypes.STRING(500), allowNull: true });
  await maybeAdd("giftPrice", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  await maybeAdd("giftImage", { type: DataTypes.STRING(500), allowNull: true });
  await maybeAdd("images", { type: DataTypes.JSON, allowNull: true });
  await maybeAdd("bestDeals", {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  });
  await maybeAdd("freeShipping", {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  });
  await maybeAdd("flashSale", {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  });
  await maybeAdd("note", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("status", {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: "Active",
  });
};

const ensureVariationStorefrontColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.variation.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("colorId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("colorImage", {
    type: DataTypes.STRING(500),
    allowNull: true,
  });
  await maybeAdd("attribute", { type: DataTypes.STRING(500), allowNull: true });
  await maybeAdd("options", { type: DataTypes.JSON, allowNull: true });
  await maybeAdd("purchasePrice", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  await maybeAdd("oldPrice", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  await maybeAdd("newPrice", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  await maybeAdd("stock", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
    defaultValue: 0,
  });
  await maybeAdd("sku", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("availability", {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: "in stock",
  });
  await maybeAdd("preOrder", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
};

const ensureCategoryFrontendColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.category.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  const maybeAdd = async (columnName, definition) => {
    if (!tableDefinition[columnName]) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("status", {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: "Active",
  });
  await maybeAdd("imageFile", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeAdd("image", { type: DataTypes.TEXT("long"), allowNull: true });
  await maybeAdd("bannerImage", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeAdd("sortOrder", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("isActive", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await maybeAdd("frontView", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await maybeAdd("metaTitle", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("metaDescription", { type: DataTypes.TEXT, allowNull: true });
};

const ensureBrandColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.brand.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };
  const maybeChange = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (hasColumn(tableDefinition, columnName)) {
      await queryInterface.changeColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("file", { type: DataTypes.TEXT("long"), allowNull: true });
  await maybeAdd("linkUrl", { type: DataTypes.STRING(512), allowNull: true });
  await maybeAdd("sortOrder", {
    type: DataTypes.INTEGER(10),
    allowNull: false,
    defaultValue: 0,
  });
  await maybeAdd("isActive", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await maybeAdd("deletedAt", { type: DataTypes.DATE, allowNull: true });

  await maybeChange("file", { type: DataTypes.TEXT("long"), allowNull: true });
};

const ensureNotificationColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.notification.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("title", {
    type: DataTypes.STRING(160),
    allowNull: false,
    defaultValue: "Notification",
  });
  await maybeAdd("type", {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: "general",
  });
  await maybeAdd("priority", {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: "normal",
  });
  await maybeAdd("data", { type: DataTypes.JSON, allowNull: true });
  await maybeAdd("readAt", { type: DataTypes.DATE, allowNull: true });
};

const ensureSiteSettingColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.siteSetting.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("settingType", {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  await maybeAdd("data", { type: DataTypes.JSON, allowNull: true });
  await maybeAdd("deletedAt", { type: DataTypes.DATE, allowNull: true });

  const tableDefinition = await queryInterface.describeTable(tableName);
  const legacyColumns = [
    "logoFile",
    "marqueeText",
    "address",
    "phone",
    "email",
    "copyrightText",
    "facebookUrl",
    "instagramUrl",
    "youtubeUrl",
    "whatsappUrl",
    "messengerUrl",
    "deliveryPartnerFile",
  ].filter((columnName) => hasColumn(tableDefinition, columnName));

  const rows = await db.siteSetting.findAll({
    attributes: ["Id", "settingType", "data", ...legacyColumns],
    where: { settingType: null },
    raw: true,
    paranoid: false,
  });

  for (const row of rows) {
    const data = legacyColumns.reduce((acc, columnName) => {
      if (
        row[columnName] !== undefined &&
        row[columnName] !== null &&
        row[columnName] !== ""
      ) {
        acc[columnName] = row[columnName];
      }
      return acc;
    }, {});
    await db.siteSetting.update(
      { settingType: "general", data: row.data || data },
      { where: { Id: row.Id }, paranoid: false },
    );
  }

  await queryInterface.changeColumn(tableName, "settingType", {
    type: DataTypes.STRING(64),
    allowNull: false,
  });
};

const ensureGoogleAdsColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.googleAds.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("conversionActionId", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("developerToken", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("clientId", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("clientSecret", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("refreshToken", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("loginCustomerId", { type: DataTypes.STRING, allowNull: true });
};

const ensureBannerColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.banner.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("categoryId", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
  });
  await maybeAdd("categoryName", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("status", {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: "Active",
  });
  await maybeAdd("deletedAt", { type: DataTypes.DATE, allowNull: true });

  const tableDefinition = await queryInterface.describeTable(tableName);
  if (hasColumn(tableDefinition, "type")) {
    await db.sequelize.query(
      `UPDATE \`${tableName}\` SET categoryName = type WHERE categoryName IS NULL AND type IS NOT NULL`,
    );
  }
  if (hasColumn(tableDefinition, "isActive")) {
    await db.sequelize.query(
      `UPDATE \`${tableName}\` SET status = CASE WHEN isActive = 0 THEN 'Inactive' ELSE 'Active' END WHERE status IS NULL OR TRIM(status) = ''`,
    );
  }
};

const ensurePurchaseRequisitionItemsColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.purchaseRequisition.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.items) {
    await queryInterface.addColumn(tableName, "items", {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    });
  }
};

const ensurePurchaseRequisitionExtraColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.purchaseRequisition.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  const maybeAdd = async (columnName, definition) => {
    if (!tableDefinition[columnName]) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };
  await maybeAdd("productId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("assetId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("bookId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("file", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("paymentMode", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("bankName", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("bankAccount", { type: DataTypes.INTEGER, allowNull: true });
};

const ensureLandingPageContentColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.landingPage.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  const maybeAdd = async (columnName, definition) => {
    if (!tableDefinition[columnName]) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };
  const maybeChange = async (columnName, definition) => {
    if (tableDefinition[columnName]) {
      await queryInterface.changeColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("pageType", {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: "Campaign",
  });
  await maybeAdd("productId", { type: DataTypes.INTEGER(10), allowNull: true });
  await maybeAdd("product", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("title", { type: DataTypes.STRING, allowNull: false });
  await maybeAdd("subTitle", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("bannerImageUrl", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeAdd("prizeImageUrl", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeAdd("reviewImages", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeAdd("shortDescription", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("video", { type: DataTypes.STRING(500), allowNull: true });
  await maybeAdd("reviewTitle", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("descriptionTitle", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await maybeAdd("description", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("whyChooseTitle", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("whyChooseUs", { type: DataTypes.TEXT, allowNull: true });
  await maybeAdd("price", { type: DataTypes.DECIMAL(10, 2), allowNull: true });
  await maybeAdd("originalPrice", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });
  await maybeAdd("phone", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("template", { type: DataTypes.STRING, allowNull: true });
  await maybeAdd("countdown", { type: DataTypes.STRING(64), allowNull: true });
  await maybeAdd("regularData", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeAdd("status", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await maybeAdd("deletedAt", { type: DataTypes.DATE, allowNull: true });

  await maybeChange("bannerImageUrl", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeChange("prizeImageUrl", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await maybeChange("reviewImages", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
};

const ensureOrderIpAddressColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.order.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.ipAddress) {
    await queryInterface.addColumn(tableName, "ipAddress", {
      type: DataTypes.STRING(128),
      allowNull: true,
    });
  }
};

const ensureOrderDeviceIdColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.order.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.deviceId) {
    await queryInterface.addColumn(tableName, "deviceId", {
      type: DataTypes.STRING(128),
      allowNull: true,
    });
  }
};

const ensureOrderSourceColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.order.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.orderSource) {
    await queryInterface.addColumn(tableName, "orderSource", {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
  }
};

const ensureIpBlockCompatibilityColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.ipBlock.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("deviceId", {
    type: DataTypes.STRING(128),
    allowNull: true,
  });
  await maybeAdd("expiresAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
};

const ensureOrderStatusShowAfterColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.orderStatus.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (hasColumn(tableDefinition, "showAfter")) return;
  await queryInterface.addColumn(tableName, "showAfter", {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  // One-time placement when the column is created: Courier Pickup / Sales sits after In Courier.
  await db.sequelize.query(
    `UPDATE \`${tableName}\` SET showAfter = 'in_courier'
     WHERE LOWER(REGEXP_REPLACE(name, '[^A-Za-z0-9]+', '_')) = 'courier_pickup_sales'`,
  );
};

const ensureOrderStatusColumn = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.order.getTableName();
  const tableDefinition = await queryInterface.describeTable(tableName);
  if (!tableDefinition.status) {
    await queryInterface.addColumn(tableName, "status", {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "pending",
    });
    return;
  }
  await queryInterface.changeColumn(tableName, "status", {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: "pending",
  });
};

const ensureOrderFraudGuardColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.order.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("fraudStatus", {
    type: DataTypes.STRING(32),
    allowNull: true,
  });
  await maybeAdd("fraudReason", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

const ensureOrderAssignmentColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const tableName = db.order.getTableName();
  const maybeAdd = async (columnName, definition) => {
    const tableDefinition = await queryInterface.describeTable(tableName);
    if (!hasColumn(tableDefinition, columnName)) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  };

  await maybeAdd("assignedEmployeeId", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
  });
  await maybeAdd("assignedEmployeeName", {
    type: DataTypes.STRING(191),
    allowNull: true,
  });
  await maybeAdd("assignedById", {
    type: DataTypes.INTEGER(10),
    allowNull: true,
  });
  await maybeAdd("assignedByName", {
    type: DataTypes.STRING(191),
    allowNull: true,
  });
  await maybeAdd("assignedAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await maybeAdd("stockLedger", {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

// Reward points / customers / reviews: columns added after their tables existed.
const ensureRewardColumns = async () => {
  const queryInterface = db.sequelize.getQueryInterface();
  const addMissing = async (Model, columns) => {
    const tableName = Model.getTableName();
    const tableDefinition = await queryInterface.describeTable(tableName);
    for (const [columnName, definition] of Object.entries(columns)) {
      if (!hasColumn(tableDefinition, columnName)) {
        await queryInterface.addColumn(tableName, columnName, definition);
      }
    }
  };

  await addMissing(db.rewardTransaction, {
    refKey: { type: DataTypes.STRING(64), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    expiryChecked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reminderSent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  });
  const rewardTable = db.rewardTransaction.getTableName();
  const rewardIndexes = await queryInterface.showIndex(rewardTable);
  if (!rewardIndexes.some((index) => index.name === "reward_transactions_phone_ref_unique")) {
    await queryInterface.addIndex(rewardTable, ["phone", "refKey"], {
      name: "reward_transactions_phone_ref_unique", unique: true,
    });
  }
  await addMissing(db.customer, {
    referredById: { type: DataTypes.INTEGER(10), allowNull: true },
  });
  await addMissing(db.review, {
    customerPhone: { type: DataTypes.STRING(20), allowNull: true },
  });
};

// =====================
// Sync
// =====================

db.ready = db.sequelize
  .sync({ force: false })
  .then(async () => {
    await ensureUserRoleColumn();
    await ensureUserStatusColumn();
    await ensureUserOrderDistributionColumn();
    await ensureUserDocumentColumns();
    await ensureNotificationColumns();
    await ensureSupplierStatusNoteColumns();
    await ensureSupplierHistoryColumns();
    await ensureSubcategoryTableCompatibility();
    await ensureChildcategoryImageColumn();
    await ensureProductStatusNoteColumns();
    await ensureVariationStorefrontColumns();
    await ensureCategoryFrontendColumns();
    await ensureBrandColumns();
    await ensureSiteSettingColumns();
    await ensureGoogleAdsColumns();
    await ensureBannerColumns();
    await ensurePurchaseRequisitionItemsColumn();
    await ensurePurchaseRequisitionExtraColumns();
    await ensureIpBlockCompatibilityColumns();
    const orderTable = db.order.getTableName();
    const qi = db.sequelize.getQueryInterface();
    const columns = await qi.describeTable(orderTable);
    if (!columns.checkoutKey) {
      await qi.addColumn(orderTable, "checkoutKey", {
        type: DataTypes.STRING(128), allowNull: true,
      });
    }
    const indexes = await qi.showIndex(orderTable);
    if (!indexes.some((index) => index.name === "orders_checkout_key_unique")) {
      await qi.addIndex(orderTable, ["checkoutKey"], {
        name: "orders_checkout_key_unique", unique: true,
      });
    }
    await db.orderWriteLock.findOrCreate({ where: { Id: 1 } });
    // Banners in this category feed the storefront's main homepage slider.
    await db.bannerCategory.findOrCreate({
      where: { name: "Main Slider" },
      defaults: { status: "Active", sortOrder: 0 },
    });
    await ensureOrderIpAddressColumn();
    await ensureOrderDeviceIdColumn();
    await ensureOrderSourceColumn();
    await ensureOrderStatusColumn();
    await ensureOrderStatusShowAfterColumn();
    await ensureOrderFraudGuardColumns();
    await ensureOrderAssignmentColumns();
    await ensureLandingPageContentColumns();
    await ensureRewardColumns();
    // One customer per phone: add any phone from past orders that has none yet.
    const addedCustomers = await require("../app/modules/customer/customerSync")
      .backfillCustomers(db)
      .catch((error) => {
        console.error("Customer backfill failed:", error.message);
        return 0;
      });
    if (addedCustomers) console.log(`Added ${addedCustomers} customers from orders`);
    console.log("Connection re-synced successfully");
  })
  .catch((err) => {
    console.error("Error on re-sync:", err);
    throw err;
  });

module.exports = db;
