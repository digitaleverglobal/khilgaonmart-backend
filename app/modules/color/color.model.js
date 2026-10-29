module.exports = (sequelize, DataTypes) => {
  const Color = sequelize.define(
    "Color",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
      hex: { type: DataTypes.STRING(10), allowNull: true, defaultValue: "#000000" },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return Color;
};
