module.exports = (sequelize, DataTypes) => {
  const CodChange = sequelize.define(
    "CodChange",
    {
      Id: {
        type: DataTypes.INTEGER(10),
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdByUserId: {
        type: DataTypes.INTEGER(10),
        allowNull: true,
      },
      createdByRole: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      paranoid: true,
      tableName: "CodChanges",
    },
  );

  return CodChange;
};
