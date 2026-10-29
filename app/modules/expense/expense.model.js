module.exports = (sequelize, DataTypes) => sequelize.define("Expense", {
  Id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(191), allowNull: false },
  categoryId: { type: DataTypes.INTEGER, allowNull: true },
  categoryName: { type: DataTypes.STRING(160), allowNull: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  note: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
  deletedAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true, paranoid: true });
