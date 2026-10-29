module.exports = (sequelize, DataTypes) => {
  const Childcategory = sequelize.define(
    "Childcategory",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
      subcategoryId: { type: DataTypes.INTEGER(10), allowNull: true },
      image: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return Childcategory;
};
