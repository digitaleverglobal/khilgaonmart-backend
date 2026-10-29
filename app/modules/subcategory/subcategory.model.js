module.exports = (sequelize, DataTypes) => {
  const Subcategory = sequelize.define(
    "Subcategory",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
      categoryId: { type: DataTypes.INTEGER(10), allowNull: true },
      image: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true, tableName: "SubCategories" }
  );
  return Subcategory;
};
