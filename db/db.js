// connect to database
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Sequelize } = require("sequelize");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require("dotenv");
dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST, // Use host from environment variable
    dialect: "mysql",
    // pool: {
    //   max: 10,
    //   min: 0,
    //   idle: 10000,
    //   acquire: 30000, // Add acquire timeout (default 60s)
    // },
    dialectOptions: {
      connectTimeout: 30000,
    },
    retry: {
      max: 1, // retry একবারই — বারবার retry = connection limit শেষ হয়
    },
    pool: {
      max: 3,     // 5 থেকে কমিয়ে 3 — প্রতি restart-এ কম connection নেবে
      min: 0,
      acquire: 30000,
      idle: 5000, // idle connection তাড়াতাড়ি ছেড়ে দেবে
      evict: 5000,
    },

    // logging: process.env.NODE_ENV !== 'production',  // Enable logging only in non-prod
    logging: false,
    timezone: "+06:00", // Timezone
    port: process.env.DB_PORT || 3306, // Optionally use the DB_PORT from env
  },
);

// Test the connection
sequelize
  .authenticate()
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((error) => {
    console.error("Error connecting to the database:", error.message);
    console.error("DB_HOST:", process.env.DB_HOST || "NOT SET");
    console.error("DB_NAME:", process.env.DB_NAME || "NOT SET");
    console.error("DB_USER:", process.env.DB_USER || "NOT SET");
    console.error("DB_PORT:", process.env.DB_PORT || "NOT SET");
    process.exit(1);
  });

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

module.exports = db;
