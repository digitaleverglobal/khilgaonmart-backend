module.exports = (sequelize, DataTypes) => {
  const BannerCategory = sequelize.define(
    "BannerCategory",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
      sortOrder: { type: DataTypes.INTEGER(10), allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true },
  );

  return BannerCategory;
};
