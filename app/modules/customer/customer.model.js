// One row per customer phone number, filled from orders (see customerSync.js).
// Separate from Users: shoppers don't need an account to be a customer.
module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    "Customer",
    {
      Id:          { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      // Normalized to 01XXXXXXXXX where possible.
      phone:       { type: DataTypes.STRING(20),  allowNull: false, unique: "customers_phone_unique" },
      name:        { type: DataTypes.STRING,      allowNull: true },
      address:     { type: DataTypes.TEXT,        allowNull: true },
      district:    { type: DataTypes.STRING(100), allowNull: true },
      note:        { type: DataTypes.TEXT,        allowNull: true },
      // "Blocked" customers can't place website orders.
      status:      { type: DataTypes.STRING(32),  allowNull: false, defaultValue: "Active" },
      lastOrderAt: { type: DataTypes.DATE,        allowNull: true },
      // The customer whose referral code this customer signed up with.
      referredById: { type: DataTypes.INTEGER(10), allowNull: true },
    },
    { timestamps: true, tableName: "Customers" }
  );
  return Customer;
};
