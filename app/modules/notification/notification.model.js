module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    "Notification",
    {
      Id: { type: DataTypes.INTEGER(10), primaryKey: true, autoIncrement: true, allowNull: false },
      userId: { type: DataTypes.INTEGER(10), allowNull: false },
      title: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "Purchase requisition" },
      message: { type: DataTypes.TEXT, allowNull: false },
      type: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "general" },
      priority: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "normal" },
      url: { type: DataTypes.STRING(500), allowNull: true },
      data: { type: DataTypes.JSON, allowNull: true },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      readAt: { type: DataTypes.DATE, allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ["userId", "isRead"] },
        { fields: ["createdAt"] },
      ],
      hooks: {
        afterCreate(notification, options) {
          const emit = () => {
            const { emitToUser } = require("../../realtime/socket");
            emitToUser(notification.userId, "notification:new", notification.toJSON());
          };
          if (options.transaction?.afterCommit) options.transaction.afterCommit(emit);
          else emit();
        },
      },
    },
  );
  return Notification;
};
