const db = require("../../models");
const { getClientIp } = require("./clientIp");

const SENSITIVE_KEYS = new Set([
  "password",
  "Password",
  "confirmPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "apiKey",
]);

const normalizeString = (value, max = 500) => {
  if (value === undefined || value === null) return null;
  const stringValue = String(value);
  return stringValue.length > max
    ? `${stringValue.slice(0, max)}...`
    : stringValue;
};

const sanitizeValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const sanitized = {};

    Object.keys(value)
      .slice(0, 50)
      .forEach((key) => {
        if (SENSITIVE_KEYS.has(key)) {
          sanitized[key] = "[REDACTED]";
          return;
        }

        const currentValue = value[key];

        if (currentValue && typeof currentValue === "object") {
          if (Buffer.isBuffer(currentValue)) {
            sanitized[key] = "[BUFFER]";
            return;
          }

          sanitized[key] = sanitizeValue(currentValue);
          return;
        }

        sanitized[key] =
          typeof currentValue === "string"
            ? normalizeString(currentValue)
            : currentValue;
      });

    return sanitized;
  }

  if (typeof value === "string") {
    return normalizeString(value);
  }

  return value;
};

const getRouteTemplate = (req) => {
  const baseUrl = req.baseUrl || "";
  const routePath = req.route?.path || req.path || "";
  return `${baseUrl}${routePath}` || req.originalUrl || "/";
};

const resolveModuleName = (req) => {
  const template = getRouteTemplate(req);
  const segments = template.split("/").filter(Boolean);
  return segments[2] || segments[1] || "system";
};

const resolveActionName = ({ method, req, fallbackAction }) => {
  if (fallbackAction) return fallbackAction;

  const template = getRouteTemplate(req).toLowerCase();

  if (template.includes("/login")) return "login";
  if (template.includes("/register")) return "register";
  if (method === "GET") return "view";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";

  return "action";
};

const shouldLogRequest = (req) => {
  const method = String(req.method || "").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
};

const resolveIpAddress = getClientIp;

const createUserLogHistory = async ({
  req,
  user = null,
  action = null,
  statusCode = 200,
  status = null,
  responseMessage = null,
  metadata = null,
}) => {
  try {
    await db.userLogHistory.create({
      userId: user?.Id || user?.userId || null,
      userEmail: user?.Email || user?.email || null,
      userRole: user?.role || null,
      action: resolveActionName({
        method: req.method,
        req,
        fallbackAction: action,
      }),
      module: resolveModuleName(req),
      method: req.method,
      route: getRouteTemplate(req),
      statusCode,
      status:
        status ||
        (statusCode >= 200 && statusCode < 400 ? "success" : "failed"),
      ipAddress: resolveIpAddress(req),
      userAgent: normalizeString(req.get("user-agent"), 1000),
      requestParams: sanitizeValue(req.params),
      requestQuery: sanitizeValue(req.query),
      requestBody: sanitizeValue(req.body),
      responseMessage: normalizeString(responseMessage),
      metadata: sanitizeValue(metadata),
    });
  } catch (error) {
    console.error("Failed to write user log history:", error.message);
  }
};

module.exports = {
  createUserLogHistory,
  sanitizeValue,
  shouldLogRequest,
};
