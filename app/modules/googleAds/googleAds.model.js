module.exports = (sequelize, DataTypes) => {
  const GoogleAds = sequelize.define("GoogleAds", {
    Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
    conversionId: { type: DataTypes.STRING, allowNull: false },
    conversionLabel: { type: DataTypes.STRING, allowNull: true },
    conversionActionId: { type: DataTypes.STRING, allowNull: true },
    customerId: { type: DataTypes.STRING, allowNull: true },
    developerToken: { type: DataTypes.TEXT, allowNull: true },
    clientId: { type: DataTypes.TEXT, allowNull: true },
    clientSecret: { type: DataTypes.TEXT, allowNull: true },
    refreshToken: { type: DataTypes.TEXT, allowNull: true },
    loginCustomerId: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, paranoid: true });
  return GoogleAds;
};
