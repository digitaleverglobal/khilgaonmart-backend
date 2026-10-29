module.exports = (sequelize, DataTypes) => {
  const OrderFraudCheck = sequelize.define(
    "OrderFraudCheck",
    {
      Id: {
        type: DataTypes.INTEGER(10),
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      orderId: {
        type: DataTypes.INTEGER(10),
        allowNull: false,
        unique: true,
      },
      customerPhone: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      courierStats: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      ipInfo: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      successRate: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      riskLevel: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: "unknown",
      },
      score: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
      },
      checkedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    { timestamps: true, paranoid: true },
  );

  return OrderFraudCheck;
};
