module.exports = (sequelize, DataTypes) => {
  const OrderStatus = sequelize.define(
    "OrderStatus",
    {
      Id:        { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name:      { type: DataTypes.STRING,      allowNull: false },
      status:    { type: DataTypes.STRING(32),  allowNull: false, defaultValue: "Active" },
      // Key of the status this one is listed right after (e.g. "in_courier"); null = at the end.
      showAfter: { type: DataTypes.STRING(64),  allowNull: true },
      deletedAt: { type: DataTypes.DATE,        allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return OrderStatus;
};
