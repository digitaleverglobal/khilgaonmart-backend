module.exports = (sequelize, DataTypes) => {
  const CouponCode = sequelize.define("CouponCode", {
    Id:        { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
    code:      { type: DataTypes.STRING, allowNull: false },
    date:      { type: DataTypes.STRING(32), allowNull: true },
    type:      { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Percentage" },
    amount:    { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    buyAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    image:     { type: DataTypes.STRING, allowNull: true },
    status:    { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, paranoid: true });
  return CouponCode;
};
