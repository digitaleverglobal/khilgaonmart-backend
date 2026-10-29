const validator = require("validator");
const bcrypt = require("bcryptjs");

module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    "Category",
    {
      Id: {
        type: DataTypes.INTEGER(10),
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true, // Ensure name is not empty
        },
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "Active",
      },
      imageFile: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      },
      image: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      },
      bannerImage: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER(10),
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      frontView: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      metaTitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      metaDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true, // This will be used for soft delete
      },
    },
    {
      timestamps: true,
      paranoid: true, // Enable soft delete
    },
  );

  return Category;
};
