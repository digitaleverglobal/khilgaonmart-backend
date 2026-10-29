module.exports = (sequelize, DataTypes) => {
  const UserLogHistory = sequelize.define(
    "UserLogHistory",
    {
      Id: {
        type: DataTypes.INTEGER(10),
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      userId: { type: DataTypes.INTEGER(10), allowNull: true },
      userEmail: { type: DataTypes.STRING, allowNull: true },
      userRole: { type: DataTypes.STRING(64), allowNull: true },
      action: { type: DataTypes.STRING(64), allowNull: false },
      module: { type: DataTypes.STRING(128), allowNull: true },
      method: { type: DataTypes.STRING(16), allowNull: true },
      route: { type: DataTypes.STRING(500), allowNull: true },
      statusCode: { type: DataTypes.INTEGER(10), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: true },
      ipAddress: { type: DataTypes.STRING(128), allowNull: true },
      userAgent: { type: DataTypes.TEXT, allowNull: true },
      requestParams: { type: DataTypes.JSON, allowNull: true },
      requestQuery: { type: DataTypes.JSON, allowNull: true },
      requestBody: { type: DataTypes.JSON, allowNull: true },
      responseMessage: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      timestamps: true,
      paranoid: true,
    },
  );

  return UserLogHistory;
};
