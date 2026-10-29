module.exports = (sequelize, DataTypes) => {
  const DeliveryArea = sequelize.define(
    "DeliveryArea",
    {
      Id:        { type: DataTypes.INTEGER(10),    primaryKey: true, autoIncrement: true, allowNull: false },
      district:  { type: DataTypes.STRING(100),    allowNull: false },
      area:      { type: DataTypes.STRING(150),    allowNull: false },
      charge:    { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      // Lower numbers are listed first inside a district.
      sortOrder: { type: DataTypes.INTEGER,        allowNull: false, defaultValue: 0 },
      status:    { type: DataTypes.STRING(32),     allowNull: false, defaultValue: "Active" },
      deletedAt: { type: DataTypes.DATE,           allowNull: true },
    },
    { timestamps: true, paranoid: true, tableName: "DeliveryAreas" }
  );
  return DeliveryArea;
};
