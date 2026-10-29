module.exports = (sequelize, DataTypes) => {
  const LandingPage = sequelize.define(
    "LandingPage",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      pageType: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Campaign" },
      productId: { type: DataTypes.INTEGER(10), allowNull: true },
      product: { type: DataTypes.STRING, allowNull: true },
      title: { type: DataTypes.STRING, allowNull: false },
      subTitle: { type: DataTypes.STRING, allowNull: true },
      bannerImageUrl: { type: DataTypes.TEXT("long"), allowNull: true },
      prizeImageUrl: { type: DataTypes.TEXT("long"), allowNull: true },
      reviewImages: { type: DataTypes.TEXT("long"), allowNull: true },
      shortDescription: { type: DataTypes.TEXT, allowNull: true },
      video: { type: DataTypes.STRING(500), allowNull: true },
      reviewTitle: { type: DataTypes.STRING, allowNull: true },
      descriptionTitle: { type: DataTypes.STRING, allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      whyChooseTitle: { type: DataTypes.STRING, allowNull: true },
      whyChooseUs: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      originalPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      phone: { type: DataTypes.STRING, allowNull: true },
      template: { type: DataTypes.STRING, allowNull: true },
      countdown: { type: DataTypes.STRING(64), allowNull: true },
      regularData: { type: DataTypes.TEXT("long"), allowNull: true },
      status: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true },
  );

  return LandingPage;
};
