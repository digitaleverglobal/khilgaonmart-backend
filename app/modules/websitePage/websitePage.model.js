module.exports = (sequelize, DataTypes) => {
  const WebsitePage = sequelize.define(
    "WebsitePage",
    {
      Id:          { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      name:        { type: DataTypes.STRING,      allowNull: false },
      title:       { type: DataTypes.STRING,      allowNull: true },
      description: { type: DataTypes.TEXT("long"), allowNull: true },
      status:      { type: DataTypes.STRING(32),  allowNull: false, defaultValue: "Active" },
      deletedAt:   { type: DataTypes.DATE,        allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return WebsitePage;
};
