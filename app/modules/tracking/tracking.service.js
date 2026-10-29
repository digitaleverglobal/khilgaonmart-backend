const crypto = require("crypto");
const ApiError = require("../../../error/ApiError");
const { getClientIp } = require("../../utils/clientIp");
const FacebookPixelService = require("../facebookPixel/facebookPixel.service");
const TiktokPixelService = require("../tiktokPixel/tiktokPixel.service");
const GoogleAdsService = require("../googleAds/googleAds.service");

const hash = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
};

const hashPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return hash(/^01\d{9}$/.test(digits) ? `88${digits}` : digits);
};
const asHashArray = (value) => value ? [value] : undefined;

const PLATFORM_EVENT_NAMES = {
  PageView: { meta: "PageView", tiktok: "Pageview" },
  ViewContent: { meta: "ViewContent", tiktok: "ViewContent" },
  Search: { meta: "Search", tiktok: "Search" },
  AddToCart: { meta: "AddToCart", tiktok: "AddToCart" },
  InitiateCheckout: { meta: "InitiateCheckout", tiktok: "InitiateCheckout" },
  AddPaymentInfo: { meta: "AddPaymentInfo", tiktok: "AddPaymentInfo" },
  Lead: { meta: "Lead", tiktok: "SubmitForm" },
  Contact: { meta: "Contact", tiktok: "Contact" },
  Purchase: { meta: "Purchase", tiktok: "CompletePayment" },
};

const getPlatformEventName = (eventName, platform) =>
  PLATFORM_EVENT_NAMES[eventName]?.[platform] || eventName;

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""));

const postJson = async (url, payload, headers = {}) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && !data.error && !data.partialFailureError && (!('code' in data) || Number(data.code) === 0), status: res.status, data };
};

const toMetaEvent = ({ eventName, eventId, eventSourceUrl, userData, customData, ipAddress, userAgent }) => ({
  event_name: eventName,
  event_time: Math.floor(Date.now() / 1000),
  event_id: eventId,
  action_source: "website",
  event_source_url: eventSourceUrl,
  user_data: clean({
    client_ip_address: ipAddress,
    client_user_agent: userAgent,
    em: asHashArray(hash(userData?.email)),
    ph: asHashArray(hashPhone(userData?.phone)),
    fn: asHashArray(hash(userData?.firstName || userData?.name)),
    external_id: asHashArray(hash(userData?.customerId)),
    fbp: userData?.fbp,
    fbc: userData?.fbc,
  }),
  custom_data: clean(customData || {}),
});

const sendMeta = async (payload, context) => {
  const pixels = await FacebookPixelService.getActiveFromDB();
  const results = [];
  for (const pixel of pixels) {
    const row = pixel.toJSON();
    if (!row.pixelsId || !row.metaAccessToken) continue;
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(row.pixelsId)}/events?access_token=${encodeURIComponent(row.metaAccessToken)}`;
    const body = {
      data: [toMetaEvent({
        ...payload,
        eventName: getPlatformEventName(payload.eventName, "meta"),
        ...context,
      })],
      ...(process.env.NODE_ENV !== "production" && row.testEventId ? { test_event_code: row.testEventId } : {}),
    };
    results.push({ platform: "meta", pixelId: row.pixelsId, ...(await postJson(url, body)) });
  }
  return results;
};

const toTiktokEvent = ({ eventName, eventId, eventSourceUrl, referrerUrl, userData, customData, ipAddress, userAgent }) => ({
  event: getPlatformEventName(eventName, "tiktok"),
  event_id: eventId,
  event_time: Math.floor(Date.now() / 1000),
  user: clean({
    ip: ipAddress,
    user_agent: userAgent,
    email: hash(userData?.email),
    phone: hashPhone(userData?.phone),
    external_id: hash(userData?.customerId),
    ttclid: userData?.ttclid,
    ttp: userData?.ttp,
  }),
  properties: clean(customData || {}),
  page: clean({ url: eventSourceUrl, referrer: referrerUrl }),
});

const sendTiktok = async (payload, context) => {
  const pixels = await TiktokPixelService.getActiveFromDB();
  const results = [];
  for (const pixel of pixels) {
    const row = pixel.toJSON();
    if (!row.pixelCode || !row.accessToken) continue;
    const body = {
      pixel_code: row.pixelCode,
      event_source: "web",
      event_source_id: row.pixelCode,
      data: [toTiktokEvent({ ...payload, ...context })],
      ...(process.env.NODE_ENV !== "production" && row.testEventCode ? { test_event_code: row.testEventCode } : {}),
    };
    results.push({
      platform: "tiktok",
      pixelCode: row.pixelCode,
      ...(await postJson("https://business-api.tiktok.com/open_api/v1.3/event/track/", body, {
        "Access-Token": row.accessToken,
      })),
    });
  }
  return results;
};

const getGoogleAccessToken = async (config = {}) => {
  const clientId = config.clientId || process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = config.clientSecret || process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = config.refreshToken || process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google Ads token request failed");
  }
  return data.access_token;
};

const getGoogleClickId = (userData = {}) =>
  userData.gclid || userData.gbraid || userData.wbraid || null;

const sendGoogleAds = async (payload) => {
  if (payload.eventName !== "Purchase") return [];

  const configs = await GoogleAdsService.getActiveFromDB();
  const results = [];
  for (const config of configs) {
    const row = config.toJSON();
    const developerToken = row.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const accessToken = await getGoogleAccessToken(row);
    if (!developerToken || !accessToken) {
      results.push({
        platform: "google_ads",
        conversionId: row.conversionId,
        ok: false,
        skipped: true,
        reason: "Google Ads server credentials are not configured",
      });
      continue;
    }
    const customerId = String(row.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/\D/g, "");
    const conversionActionId = String(row.conversionActionId || process.env.GOOGLE_ADS_CONVERSION_ACTION_ID || "").trim();
    const clickId = getGoogleClickId(payload.userData);
    if (!customerId || !conversionActionId || !clickId) {
      results.push({
        platform: "google_ads",
        conversionId: row.conversionId,
        ok: false,
        skipped: true,
        reason: "Missing customerId, conversionActionId, or Google click id",
      });
      continue;
    }

    const conversion = {
      conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
      conversionDateTime: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00"),
      conversionValue: Number(payload.customData?.value || 0),
      currencyCode: payload.customData?.currency || "BDT",
      orderId: String(payload.customData?.order_id || payload.eventId),
      ...(payload.userData?.gclid ? { gclid: payload.userData.gclid } : {}),
      ...(payload.userData?.gbraid ? { gbraid: payload.userData.gbraid } : {}),
      ...(payload.userData?.wbraid ? { wbraid: payload.userData.wbraid } : {}),
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    };
    const loginCustomerId = String(row.loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

    const url = `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`;
    results.push({
      platform: "google_ads",
      conversionId: row.conversionId,
      ...(await postJson(url, { conversions: [conversion], partialFailure: true }, headers)),
    });
  }
  return results;
};

const getPublicConfig = async () => {
  const [metaPixels, tiktokPixels, googleAds] = await Promise.all([
    FacebookPixelService.getPublicFromDB(),
    TiktokPixelService.getPublicFromDB(),
    GoogleAdsService.getPublicFromDB(),
  ]);
  return { metaPixels, tiktokPixels, googleAds };
};

const trackEvent = async (payload, req) => {
  const eventName = String(payload.eventName || "").trim();
  if (!eventName) throw new ApiError(400, "eventName is required");
  const eventId = payload.eventId || `${eventName}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const context = {
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"],
  };
  const basePayload = { ...payload, eventName, eventId };
  const [meta, tiktok, googleAds] = await Promise.all([
    sendMeta(basePayload, context).catch((error) => [{ platform: "meta", ok: false, error: error.message }]),
    sendTiktok(basePayload, context).catch((error) => [{ platform: "tiktok", ok: false, error: error.message }]),
    sendGoogleAds(basePayload).catch((error) => [{ platform: "google_ads", ok: false, error: error.message }]),
  ]);
  return { eventId, results: [...meta, ...tiktok, ...googleAds] };
};

module.exports = { getPublicConfig, trackEvent };
