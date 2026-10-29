module.exports = (sequelize, DataTypes) => {
  const ComboOffer = sequelize.define(
    "ComboOffer",
    {
      Id:           { type: DataTypes.INTEGER(10),   primaryKey: true, autoIncrement: true, allowNull: false },
      title:        { type: DataTypes.STRING,        allowNull: false, validate: { notEmpty: true } },
      image:        { type: DataTypes.STRING(500),   allowNull: true },
      description:  { type: DataTypes.TEXT,          allowNull: true },
      // The products in the offer, one line per variant: [{ productId, variantId, qty }]
      items:        { type: DataTypes.JSON,          allowNull: true },
      regularPrice: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
      discount:     { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
      offerPrice:   { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
      sortOrder:    { type: DataTypes.INTEGER(10),   allowNull: false, defaultValue: 0 },
      status:       { type: DataTypes.STRING(32),    allowNull: false, defaultValue: "Active" },
      deletedAt:    { type: DataTypes.DATE,          allowNull: true },
    },
    {
      timestamps: true,
      paranoid: true,
      tableName: "ComboOffers",
    },
  );

  return ComboOffer;
};
