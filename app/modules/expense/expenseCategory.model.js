module.exports = (sequelize, DataTypes) => sequelize.define("ExpenseCategory", {
  Id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
  deletedAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true, paranoid: true });
