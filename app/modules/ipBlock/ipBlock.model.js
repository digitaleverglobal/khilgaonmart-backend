module.exports = (sequelize, DataTypes) => {
  const IpBlock = sequelize.define(
    "IpBlock",
    {
      Id:       { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      ip:       { type: DataTypes.STRING,  allowNull: false },
      deviceId: { type: DataTypes.STRING(128), allowNull: true },
      reason:   { type: DataTypes.TEXT,    allowNull: true },
      expiresAt:{ type: DataTypes.DATE,    allowNull: true },
      deletedAt:{ type: DataTypes.DATE,    allowNull: true },
    },
    { timestamps: true, paranoid: true }
  );
  return IpBlock;
};
