const validator = require("validator");
const bcrypt = require("bcryptjs");

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      Id: {
        type: DataTypes.INTEGER(10),
        primaryKey: true,
        autoIncrement: true,
        allowNull: true,
      },
      FirstName: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      LastName: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      Email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      Password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Address: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      Phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      City: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      PostalCode: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      Country: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      image: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      idCard: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cv: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      guardianPhoto: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      guardianIdCard: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      role: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: "user",
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "Active",
      },
      // New website orders are handed out in turn to users with this on.
      orderDistribution: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true, // This will be used for soft delete
      },
    },
    {
      timestamps: true,
      paranoid: true,
      hooks: {
        beforeValidate: (user) => {
          if (!user.Password || !String(user.Password).trim()) {
            user.Password = "123456";
          }
        },
        beforeCreate: async (user) => {
          if (user.Password) {
            const salt = await bcrypt.genSalt(12);
            user.Password = bcrypt.hashSync(user.Password, salt);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("Password") && user.Password) {
            const salt = await bcrypt.genSalt(12);
            user.Password = bcrypt.hashSync(user.Password, salt);
          }
        },
      },
    },
  );

  User.prototype.validPassword = async function (Password) {
    return await bcrypt.compare(Password, this.Password);
  };

  return User;
};
