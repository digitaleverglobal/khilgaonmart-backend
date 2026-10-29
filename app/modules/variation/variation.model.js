module.exports = (sequelize, DataTypes) => {
  const Variation = sequelize.define(
    "Variation",
    {
      Id:            { type: DataTypes.INTEGER(10),   primaryKey: true, autoIncrement: true, allowNull: false },
      productId:     { type: DataTypes.INTEGER(10),   allowNull: true },
      colorId:       { type: DataTypes.INTEGER(10),   allowNull: true },
      colorImage:    { type: DataTypes.STRING(500),   allowNull: true },
      attribute:     { type: DataTypes.STRING(500),   allowNull: true },
      // Selected option values for this variant, e.g. { "Volume": "6ml", "Color": "Gold" }
      options:       { type: DataTypes.JSON,          allowNull: true },
      purchasePrice: { type: DataTypes.DECIMAL(12,2), allowNull: true },
      oldPrice:      { type: DataTypes.DECIMAL(12,2), allowNull: true },
      newPrice:      { type: DataTypes.DECIMAL(12,2), allowNull: true },
      stock:         { type: DataTypes.INTEGER(10),   allowNull: true, defaultValue: 0 },
      size:          { type: DataTypes.JSON,          allowNull: true },
      color:         { type: DataTypes.JSON,          allowNull: true },
      weight:        { type: DataTypes.INTEGER(10),   allowNull: true },
      unit:          { type: DataTypes.STRING,        allowNull: true },
      sku:           { type: DataTypes.STRING,        allowNull: true },
      availability:  { type: DataTypes.STRING(50),    allowNull: true, defaultValue: "in stock" },
      // Pre-order variants stay orderable (and are not shown as stock out) with no stock.
      preOrder:      { type: DataTypes.BOOLEAN,       allowNull: false, defaultValue: false },
      deletedAt:     { type: DataTypes.DATE,          allowNull: true },
    },
    {
      timestamps: true,
      paranoid: true,
      tableName: "Variations",
    },
  );

  return Variation;
};
