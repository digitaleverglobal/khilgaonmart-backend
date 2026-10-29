// Reward points ledger: a customer's balance is the sum of their rows' points.
module.exports = (sequelize, DataTypes) => {
  const RewardTransaction = sequelize.define(
    "RewardTransaction",
    {
      Id:      { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      // Customer phone, normalized like Customers.phone.
      phone:   { type: DataTypes.STRING(20),  allowNull: false },
      orderId: { type: DataTypes.INTEGER(10), allowNull: true },
      // earn | earn_reversal | redeem | redeem_refund | adjust | expire |
      // bonus_signup | bonus_first_order | bonus_review | bonus_referral
      type:    { type: DataTypes.STRING(20),  allowNull: false },
      // Positive adds to the balance, negative takes from it.
      points:  { type: DataTypes.INTEGER,     allowNull: false },
      note:    { type: DataTypes.STRING,      allowNull: true },
      // One-time bonuses per customer, e.g. "signup", "first_order", "review:<productId>".
      refKey:  { type: DataTypes.STRING(64),  allowNull: true },
      // Positive rows only: when what's left of them expires.
      expiresAt:     { type: DataTypes.DATE,    allowNull: true },
      expiryChecked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      reminderSent:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      timestamps: true,
      tableName: "RewardTransactions",
      indexes: [
        { fields: ["phone"], name: "reward_transactions_phone" },
        // Each order earns, redeems and reverses at most once.
        { fields: ["orderId", "type"], unique: true, name: "reward_transactions_order_type_unique" },
        // (phone, refKey) is unique too; that index is added in models/index.js
        // (ensureRewardColumns) after the refKey column exists on older tables.
      ],
    }
  );
  return RewardTransaction;
};
