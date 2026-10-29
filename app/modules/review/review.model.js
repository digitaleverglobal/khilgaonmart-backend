module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    "Review",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      productId: { type: DataTypes.INTEGER(10), allowNull: true },
      productName: { type: DataTypes.STRING, allowNull: true },
      customerName: { type: DataTypes.STRING, allowNull: false },
      rating: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 5 },
      comment: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "pending" },
      // Set for reviews customers write themselves; earns the review bonus once approved.
      customerPhone: { type: DataTypes.STRING(20), allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return Review;
};
