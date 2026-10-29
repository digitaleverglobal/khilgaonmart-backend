module.exports = (sequelize, DataTypes) => {
  const FacebookPixel = sequelize.define("FacebookPixel", {
    Id:              { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
    pixelsId:        { type: DataTypes.STRING, allowNull: false },
    metaAccessToken: { type: DataTypes.TEXT, allowNull: true },
    testEventId:     { type: DataTypes.STRING, allowNull: true },
    status:          { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
    deletedAt:       { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, paranoid: true });
  return FacebookPixel;
};
