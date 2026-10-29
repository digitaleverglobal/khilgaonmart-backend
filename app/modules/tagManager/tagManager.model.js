module.exports = (sequelize, DataTypes) => {
  const TagManager = sequelize.define("TagManager", {
    Id:           { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
    tagManagerId: { type: DataTypes.STRING, allowNull: false },
    status:       { type: DataTypes.STRING(32), allowNull: false, defaultValue: "Active" },
    deletedAt:    { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, paranoid: true });
  return TagManager;
};
