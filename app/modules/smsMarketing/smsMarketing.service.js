const { Op } = require("sequelize");
const https = require("https");
const http = require("http");
const db = require("../../../models");
const ApiError = require("../../../error/ApiError");

const buildOrderWhere = (filter) => {
  if (!filter || filter === "All") return {};
  const ACTIVE_STATUSES   = ["pre_order", "pending", "confirmed", "packaging", "on_hold", "in_courier", "delivered"];
  const INACTIVE_STATUSES = ["cancelled", "returned", "return_received", "incomplete"];
  if (filter === "Active Customers")   return { status: { [Op.in]: ACTIVE_STATUSES   } };
  if (filter === "Inactive Customers") return { status: { [Op.in]: INACTIVE_STATUSES } };
  return {};
};

const getRecipients = async (filter) => {
  const where = { ...buildOrderWhere(filter), customerPhone: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }, { [Op.ne]: "Guest" }] } };
  const rows = await db.order.findAll({
    attributes: ["customerPhone", "customerName"],
    where,
    paranoid: true,
  });
  const seen = new Set();
  return rows.reduce((acc, r) => {
    const phone = r.customerPhone?.trim();
    if (phone && !seen.has(phone)) { seen.add(phone); acc.push({ phone, name: r.customerName }); }
    return acc;
  }, []);
};

const getSmsGatewaySettings = async () => {
  const row = await db.siteSetting.findOne({ where: { settingType: "sms_gateway" } });
  const data = normalizeSettingData(row?.data);
  return {
    ...data,
    type: data.type || data.gatewayType || "",
    apiToken: data.apiToken || data.apiKey || "",
  };
};

const isNumericKeyMap = (value) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
};

const normalizeSettingData = (value, depth = 0) => {
  if (!value || depth > 5) return {};
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return normalizeSettingData(JSON.parse(trimmed), depth + 1);
    } catch {
      return {};
    }
  }
  if (isNumericKeyMap(value)) {
    const text = Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .join("");
    return normalizeSettingData(text, depth + 1);
  }
  if (Array.isArray(value) || typeof value !== "object") return {};
  return value;
};

// Normalize BD phone number to 880XXXXXXXXXX format
const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length === 13) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `880${digits.slice(1)}`;
  if (digits.length === 10) return `880${digits}`;
  return digits;
};

const httpRequest = (url, options, body) =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(parsed, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });

// SSL Wireless gateway (most common in Bangladesh)
const sendViaSslWireless = async (settings, recipients, smsText) => {
  const { apiToken, sid } = settings;
  if (!apiToken || !sid) throw new ApiError(500, "SSL Wireless: apiToken and sid are required in SMS gateway settings");

  const results = { sent: 0, failed: 0, errors: [] };

  for (const { phone } of recipients) {
    const msisdn = normalizePhone(phone);
    const params = new URLSearchParams({ api_token: apiToken, sid, msisdn, smstext: smsText, csmsid: `WZ${Date.now()}` });
    const url = `https://api.sslwireless.com/plain-api/send-sms?${params.toString()}`;

    try {
      const { status, body } = await httpRequest(url, { method: "GET" });
      if (status === 200 && !body.toLowerCase().includes("error")) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({ phone, response: body.slice(0, 100) });
      }
    } catch (err) {
      results.failed++;
      results.errors.push({ phone, error: err.message });
    }
  }

  return results;
};

// BDBulkSMS gateway
const sendViaBdBulkSms = async (settings, recipients, smsText) => {
  const apiKey = settings.apiKey || settings.api_key || settings.token || settings.apiToken || settings.password;
  const senderId = String(settings.senderId || settings.senderid || "").trim().replace(/^\+/, "");
  if (!apiKey) throw new ApiError(500, "BulkSMSBD: API key is required in SMS gateway settings");
  if (!senderId) throw new ApiError(500, "BulkSMSBD: Sender ID is required in SMS gateway settings");

  const phones = recipients.map((r) => normalizePhone(r.phone)).join(",");
  const params = new URLSearchParams({
    api_key: apiKey,
    type: "text",
    number: phones,
    senderid: senderId,
    message: smsText,
  });
  const url = `https://bulksmsbd.net/api/smsapi?${params.toString()}`;

  const { status, body } = await httpRequest(url, { method: "GET" });
  const responseText = String(body || "");
  let responseCode = "";
  let providerMessage = "";
  try {
    const parsed = JSON.parse(responseText);
    responseCode = String(parsed.response_code || parsed.code || "");
    providerMessage = parsed.success_message || parsed.error_message || parsed.message || "";
  } catch {
    responseCode = responseText.trim().split(/\s+/)[0] || "";
    providerMessage = responseText;
  }
  const failed = responseCode !== "202" || /error|invalid|failed|fail|insufficient|wrong|inactive/i.test(providerMessage);
  const sent = status === 200 && !failed ? recipients.length : 0;
  return {
    sent,
    failed: recipients.length - sent,
    errors: sent ? [] : [{ response: providerMessage || responseText.slice(0, 200), code: responseCode }],
  };
};

// Twilio gateway (international)
const sendViaTwilio = async (settings, recipients, smsText) => {
  const { accountSid, authToken, fromNumber } = settings;
  if (!accountSid || !authToken || !fromNumber) throw new ApiError(500, "Twilio: accountSid, authToken and fromNumber are required");

  const results = { sent: 0, failed: 0, errors: [] };
  const auth64 = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  for (const { phone } of recipients) {
    const body = new URLSearchParams({ To: `+${normalizePhone(phone)}`, From: fromNumber, Body: smsText }).toString();
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    try {
      const { status, body: resp } = await httpRequest(url, {
        method: "POST",
        headers: { Authorization: `Basic ${auth64}`, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
      }, body);
      if (status >= 200 && status < 300) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({ phone, response: resp.slice(0, 100) });
      }
    } catch (err) {
      results.failed++;
      results.errors.push({ phone, error: err.message });
    }
  }

  return results;
};

const dispatchSms = async (recipients, smsText) => {
  const settings = await getSmsGatewaySettings();
  const gatewayType = settings?.type || "";

  if (settings.status === false) {
    throw new ApiError(503, "SMS gateway is disabled.");
  }

  if (!gatewayType) {
    throw new ApiError(503, "SMS gateway is not configured. Please set up SMS gateway in Site Settings (settingType: sms_gateway).");
  }

  let result;
  if (gatewayType === "ssl_wireless") {
    result = await sendViaSslWireless(settings, recipients, smsText);
  } else if (gatewayType === "bdbulksms") {
    result = await sendViaBdBulkSms(settings, recipients, smsText);
  } else if (gatewayType === "twilio") {
    result = await sendViaTwilio(settings, recipients, smsText);
  } else {
    throw new ApiError(503, `Unsupported SMS gateway type: "${gatewayType}". Supported: ssl_wireless, bdbulksms, twilio`);
  }
  return { gatewayType, result };
};

const sendSmsMarketing = async ({ customers = "All", smsText }) => {
  if (!smsText?.trim()) throw new ApiError(400, "SMS text is required");

  const recipients = await getRecipients(customers);
  if (recipients.length === 0) throw new ApiError(400, "No recipients found for selected filter");

  const { gatewayType, result } = await dispatchSms(recipients, smsText);
  return {
    recipientCount: recipients.length,
    filter:         customers,
    gatewayType,
    sent:           result.sent,
    failed:         result.failed,
    errors:         result.errors,
    message:        `SMS sent to ${result.sent} of ${recipients.length} recipient(s).`,
  };
};

const sendTransactionalSms = async (phone, smsText) => {
  if (!phone) throw new ApiError(400, "Phone number is required");
  if (!smsText?.trim()) throw new ApiError(400, "SMS text is required");

  const settings = await getSmsGatewaySettings();
  const gatewayType = settings?.type || "";
  const recipients = [{ phone }];

  if (settings.status === false || settings.otpVerification === false) {
    throw new ApiError(503, "SMS gateway is disabled.");
  }

  if (!gatewayType) {
    throw new ApiError(503, "SMS gateway is not configured. Please set up SMS gateway in Site Settings (settingType: sms_gateway).");
  }

  if (gatewayType === "ssl_wireless") {
    return sendViaSslWireless(settings, recipients, smsText);
  }
  if (gatewayType === "bdbulksms") {
    return sendViaBdBulkSms(settings, recipients, smsText);
  }
  if (gatewayType === "twilio") {
    return sendViaTwilio(settings, recipients, smsText);
  }

  throw new ApiError(503, `Unsupported SMS gateway type: "${gatewayType}". Supported: ssl_wireless, bdbulksms, twilio`);
};

// recipients: [{ phone, name }]
const sendSmsToRecipients = async (recipients, smsText) => {
  if (!smsText?.trim()) throw new ApiError(400, "SMS text is required");
  if (!recipients.length) throw new ApiError(400, "No recipients found");
  const { gatewayType, result } = await dispatchSms(recipients, smsText);
  return {
    recipientCount: recipients.length,
    gatewayType,
    sent:    result.sent,
    failed:  result.failed,
    errors:  result.errors,
    message: `SMS sent to ${result.sent} of ${recipients.length} recipient(s).`,
  };
};

module.exports = { sendSmsMarketing, sendTransactionalSms, sendSmsToRecipients };
