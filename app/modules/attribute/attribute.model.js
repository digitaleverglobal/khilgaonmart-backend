module.exports = (sequelize, DataTypes) => {
  const Attribute = sequelize.define(
    "Attribute",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
      values: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return Attribute;
};
