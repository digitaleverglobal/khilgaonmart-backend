module.exports = (sequelize, DataTypes) => {
  const VisitorStat = sequelize.define("VisitorStat", {
    Id:        { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
    date:      { type: DataTypes.DATEONLY, allowNull: false },
    visitors:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, paranoid: true });
  return VisitorStat;
};
