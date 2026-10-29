require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const {
  getClientIp,
  isInternalServerRequest,
  isTrustedProxyRequest,
} = require("./app/utils/clientIp");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const db = require("./models"); // Sequelize instance
const routes = require("./app/routes");
const ApiError = require("./error/ApiError");
const userLogHistory = require("./app/middlewares/userLogHistory");
const { initializeChatSocket } = require("./app/realtime/socket");
const { UPLOAD_DIR } = require("./helpers/fileStorage");

const {
  createCourierSyncWorker,
} = require("./app/modules/order/courierSync.worker");
const courierSyncWorker = createCourierSyncWorker({
  Order: db.order,
  service: require("./app/modules/order/order.service"),
});
const erpSyncWorker =
  require("./app/modules/order/erpSync").createErpSyncWorker();
const rewardWorker = require("./app/modules/reward/reward.worker").createRewardWorker({
  ready: db.ready,
  service: require("./app/modules/reward/reward.service"),
});

const app = express();
const server = http.createServer(app);
// The Next.js rewrite proxy reuses keep-alive sockets. Node's default 5s
// keepAliveTimeout closes them first, so a reused socket gets ECONNRESET and the
// proxy answers with an empty body. Keep sockets open longer than the proxy does.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
initializeChatSocket(server);

let compression;
try {
  compression = require("compression");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") {
    throw error;
  }
  console.warn(
    "Optional dependency 'compression' is not installed; continuing without response compression.",
  );
}

const requiredEnvVars = ["TOKEN_SECRET", "REFRESH_SECRET"];
const missingEnvVars = requiredEnvVars.filter(
  (key) => !String(process.env[key] || "").trim(),
);
if (missingEnvVars.length) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

/* ========================
   SECURITY HEADERS
======================== */

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow /images to be served cross-origin
  }),
);

/* ========================
   COMPRESSION (gzip JSON & static responses)
======================== */

if (compression) {
  app.use(compression());
}

/* ========================
   CORS
======================== */

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

const ALLOWED_ORIGINS = new Set(
  `${DEFAULT_ALLOWED_ORIGINS.join(",")},${process.env.ALLOWED_ORIGINS || ""}`
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);

const isLocalDevOrigin = (origin = "") =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/+$/, "");
    if (
      ALLOWED_ORIGINS.has(normalizedOrigin) ||
      isLocalDevOrigin(normalizedOrigin)
    )
      return callback(null, normalizedOrigin);

    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ========================
   RATE LIMITING
======================== */

// Number of reverse proxies (nginx, load balancer) directly in front of this
// server; decides how req.ip is read for callers that are not the frontend.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));

// Key by the customer's real IP: the frontend proxy forwards it with a shared
// secret (see app/utils/clientIp.js); a forged X-Forwarded-For is ignored.
const clientIpKey = (req) => ipKeyGenerator(getClientIp(req) || "unknown");
const limiterDefaults = {
  keyGenerator: clientIpKey,
  // Frontend server-side rendering is not a customer; don't throttle it.
  skip: isInternalServerRequest,
  // X-Forwarded-For is handled above, so silence the library's misconfig warning.
  validate: { xForwardedForHeader: false },
};

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many attempts. Try again in 1 minute.",
  },
  skipSuccessfulRequests: true,
});

// General API limiter
const apiLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Too many requests. Slow down." },
});

app.use("/api/v1/user/login", authLimiter);
app.use("/api/v1/user/refresh-token", authLimiter);
app.use("/api/v1/user/register", authLimiter);
app.use("/api/v1", apiLimiter);

/* ========================
   MIDDLEWARE
======================== */

const captureRawBodyForWebhooks = (req, res, buffer) => {
  const webhookPath = req.originalUrl?.split("?")[0]?.replace(/\/+$/, "");
  if (
    webhookPath === "/api/v1/integrations/woocommerce/orders" ||
    webhookPath === "/api/v1/integrations/woocommerce/products"
  ) {
    req.rawBody = Buffer.from(buffer);
  }
};

app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.json({ limit: "25mb", verify: captureRawBodyForWebhooks }));
app.use(cookieParser());
app.use(userLogHistory);

/* ========================
   STATIC FILES
======================== */

app.use(
  "/images",
  express.static(UPLOAD_DIR, {
    // Uploaded SVGs may contain scripts; sandbox them when opened directly.
    setHeaders: (res, filePath) => {
      if (filePath.toLowerCase().endsWith(".svg")) {
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
      }
    },
  }),
);

/* ========================
   SWAGGER DOCS
======================== */

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Holy Deen Backend API",
      version: "1.0.0",
      description: "API documentation for Holy Deen Backend",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./app/modules/**/*.routes.js"],
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, { explorer: true }),
);
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

/* ========================
   ROUTES
======================== */

// Health check route (important for monitoring)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API server is running",
  });
});

app.get("/api/v1/health", async (req, res, next) => {
  try {
    await db.sequelize.query("SELECT 1");
    res.status(200).json({
      status: "success",
      message: "API and database are reachable",
    });
  } catch (error) {
    next(error);
  }
});

// TEMPORARY: shows the IP chain each hop adds, to pick TRUSTED_PROXY_HOPS /
// TRUST_PROXY_HOPS on the host. Remove once those are set.
app.get("/api/v1/ip-check", (req, res) => {
  res.json({
    connectionIp: req.socket?.remoteAddress,
    xForwardedFor: req.headers["x-forwarded-for"] || null,
    xRealIp: req.headers["x-real-ip"] || null,
    cfConnectingIp: req.headers["cf-connecting-ip"] || null,
    xClientIpFromFrontend: req.headers["x-client-ip"] || null,
    frontendSecretValid: isTrustedProxyRequest(req),
    detectedIp: getClientIp(req),
  });
});

app.use("/api/v1", routes);

/* ========================
   404 HANDLER
======================== */

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "API not found",
  });
});

/* ========================
   GLOBAL ERROR HANDLER
======================== */

app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === "development";

  // Only log full error in development; production logs minimal info
  if (isDev) {
    console.error("Global Error:", err);
  } else {
    console.error(`[${new Date().toISOString()}] ${err.message}`);
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      ...(isDev && { stack: err.stack }),
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      status: "error",
      message:
        'Invalid JSON body. Wrap phone numbers in quotes, e.g. "Phone": "01518301098".',
      ...(isDev && { stack: err.stack }),
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      status: "error",
      message: err.message || "File upload failed",
      ...(isDev && { stack: err.stack }),
    });
  }

  if (err.message?.startsWith("Invalid file format")) {
    return res.status(400).json({
      status: "error",
      message: err.message,
      ...(isDev && { stack: err.stack }),
    });
  }

  if (err.code === "ENOENT") {
    return res.status(500).json({
      status: "error",
      message: "Upload folder is missing or not writable.",
      ...(isDev && { stack: err.stack }),
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

/* ========================
   SERVER START FUNCTION
======================== */

const startServer = async () => {
  try {
    // Authenticate DB connection
    await db.sequelize.authenticate();
    await db.ready;
    console.log("✅ Database connected successfully");

    // Sync models (optional in production)
    // await db.sequelize.sync();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      courierSyncWorker.start();
      erpSyncWorker.start();
      rewardWorker.start();
    });
  } catch (error) {
    console.error("❌ Failed to connect to database:", error.message);
    if (error.original?.code === "ER_USER_LIMIT_REACHED") {
      console.error(
        "⚠️  DB connection limit exceeded. ১ ঘণ্টা পর আবার চেষ্টা করুন অথবা hosting panel থেকে connection reset করুন।",
      );
    }
    process.exit(1);
  }
};

startServer();

/* ========================
   GRACEFUL SHUTDOWN
======================== */

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  await courierSyncWorker.stop();
  await erpSyncWorker.stop();
  await rewardWorker.stop();
  await db.sequelize.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down gracefully...");
  await courierSyncWorker.stop();
  await erpSyncWorker.stop();
  await rewardWorker.stop();
  await db.sequelize.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
