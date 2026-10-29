module.exports = (sequelize, DataTypes) => {
  const Banner = sequelize.define(
    "Banner",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      linkUrl: { type: DataTypes.STRING(1000), allowNull: true },
      categoryId: { type: DataTypes.INTEGER(10), allowNull: true },
      categoryName: { type: DataTypes.STRING, allowNull: true },
      file: { type: DataTypes.TEXT("long"), allowNull: false },
      alt: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
      sortOrder: { type: DataTypes.INTEGER(10), allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true },
  );

  return Banner;
};
