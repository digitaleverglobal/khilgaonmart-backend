const crypto = require("crypto");
const net = require("net");

// The Next.js frontend proxies browser calls to /api/v1 and sends the customer's
// IP in X-Client-IP together with a shared secret. Any caller can forge
// X-Forwarded-For, so a forwarded IP is only trusted when the secret matches;
// everything else falls back to req.ip (governed by Express "trust proxy").
const PROXY_SECRET_HEADER = "x-proxy-secret";
const CLIENT_IP_HEADER = "x-client-ip";

const normalizeIp = (ip) => String(ip || "").replace(/^::ffff:/, "").trim();

const isTrustedProxyRequest = (req) => {
  const secret = process.env.PROXY_SECRET;
  const provided = req.headers[PROXY_SECRET_HEADER];
  if (!secret || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const forwardedClientIp = (req) => {
  if (!isTrustedProxyRequest(req)) return null;
  const ip = normalizeIp(req.headers[CLIENT_IP_HEADER]);
  return net.isIP(ip) ? ip : null;
};

const getClientIp = (req) =>
  forwardedClientIp(req) || normalizeIp(req.ip || req.socket?.remoteAddress) || null;

// Server-side rendering calls from the frontend carry the secret but no client IP.
const isInternalServerRequest = (req) =>
  isTrustedProxyRequest(req) && !req.headers[CLIENT_IP_HEADER];

module.exports = { getClientIp, isTrustedProxyRequest, isInternalServerRequest };
