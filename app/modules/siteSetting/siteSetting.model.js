module.exports = (sequelize, DataTypes) => {
  const SiteSetting = sequelize.define(
    "SiteSetting",
    {
      Id:          { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      settingType: { type: DataTypes.STRING(64), allowNull: false },
      data:        { type: DataTypes.JSON, allowNull: true },
      deletedAt:   { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return SiteSetting;
};
