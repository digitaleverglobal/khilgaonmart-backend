module.exports = (sequelize, DataTypes) => {
  const TiktokPixel = sequelize.define("TiktokPixel", {
    Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
    pixelCode: { type: DataTypes.STRING, allowNull: false },
    accessToken: { type: DataTypes.TEXT, allowNull: true },
    testEventCode: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, paranoid: true });
  return TiktokPixel;
};
