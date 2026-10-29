module.exports = (sequelize, DataTypes) => {
  const Brand = sequelize.define(
    "Brand",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
      logo: { type: DataTypes.TEXT("long"), allowNull: true, field: "file" },
      linkUrl: { type: DataTypes.STRING(512), allowNull: true },
      sortOrder: { type: DataTypes.INTEGER(10), allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      status: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDataValue("isActive") === false ? "Inactive" : "Active";
        },
        set(value) {
          this.setDataValue(
            "isActive",
            !(value === false || value === "Inactive" || value === "inactive"),
          );
        },
      },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return Brand;
};
