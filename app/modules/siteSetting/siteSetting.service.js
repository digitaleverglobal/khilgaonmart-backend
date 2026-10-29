const db = require("../../../models");
const ApiError = require("../../../error/ApiError");
const { replaceInlineImages } = require("../../../helpers/inlineImages");
const { normalizeRewardSettings } = require("../reward/reward.settings");

const VALID_TYPES = [
  "general", "social_media", "contact",
  "courier_api", "payment_gateway", "sms_gateway", "fraud_checker", "header", "footer", "website_footer", "order_block", "reward",
];

const validateType = (settingType) => {
  const t = String(settingType || "").trim().toLowerCase();
  if (!VALID_TYPES.includes(t)) throw new ApiError(400, `Invalid setting type. Valid: ${VALID_TYPES.join(", ")}`);
  return t;
};

const getByType = async (settingType) => {
  const type = validateType(settingType);
  const row = await db.siteSetting.findOne({ where: { settingType: type } });
  if (!row) return null;
  const plain = row.get({ plain: true });
  plain.data = type === "social_media"
    ? normalizeSocialMediaStorage(plain.data)
    : normalizeSettingData(plain.data);
  return plain;
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

const normalizePhoneForWhatsApp = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return `88${digits}`;
  return digits;
};

const normalizeSocialUrl = (key, value) => {
  const url = String(value || "").trim();
  if (!url) return "";
  if (key === "whatsapp" && !/^https?:\/\//i.test(url)) {
    const phone = normalizePhoneForWhatsApp(url);
    return phone ? `https://wa.me/${phone}` : "";
  }
  return url;
};

const normalizeSocialMediaData = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return normalizeSocialMediaData(JSON.parse(trimmed));
    } catch {
      return {};
    }
  }

  if (!Array.isArray(value)) return normalizeSettingData(value);

  return value.reduce((acc, platform) => {
    if (!platform || typeof platform !== "object") return acc;
    if (platform.active === false || !platform.url) return acc;
    const key = String(platform.key || "").trim();
    if (!key) return acc;
    const url = normalizeSocialUrl(key, platform.url);
    if (!url) return acc;
    acc[`${key}Url`] = url;
    return acc;
  }, {});
};

const normalizeSocialMediaStorage = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return normalizeSocialMediaStorage(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
};

const getPublic = async () => {
  const [general, socialMedia, contact, header, footer, websiteFooter, reward] = await Promise.all([
    db.siteSetting.findOne({ where: { settingType: "general" } }),
    db.siteSetting.findOne({ where: { settingType: "social_media" } }),
    db.siteSetting.findOne({ where: { settingType: "contact" } }),
    db.siteSetting.findOne({ where: { settingType: "header" } }),
    db.siteSetting.findOne({ where: { settingType: "footer" } }),
    db.siteSetting.findOne({ where: { settingType: "website_footer" } }),
    db.siteSetting.findOne({ where: { settingType: "reward" } }),
  ]);

  const generalData = normalizeSettingData(general?.data);
  const socialMediaData = normalizeSocialMediaData(socialMedia?.data);
  const contactData = normalizeSettingData(contact?.data);
  const headerData = normalizeSettingData(header?.data);
  const footerData = normalizeSettingData(footer?.data);
  const websiteFooterData = normalizeSettingData(websiteFooter?.data);
  const contactActive = contactData.status !== false;
  const whiteLogo = generalData.whiteLogo;
  const darkLogo = generalData.darkLogo;
  const faviconLogo = generalData.faviconLogo;
  const scrollText = generalData.scrollText;
  const phone = contactActive
    ? contactData.phone || contactData.phoneNumber || contactData.hotlineNumber || null
    : null;
  const email = contactActive
    ? contactData.email || contactData.hotMail || null
    : null;
  const whatsappNumber = contactActive ? contactData.whatsappNumber || null : null;
  const contactWhatsappUrl = whatsappNumber
    ? `https://wa.me/${normalizePhoneForWhatsApp(whatsappNumber)}`
    : null;

  return {
    name: generalData.name || null,
    logoFile: generalData.logoFile || whiteLogo || darkLogo || null,
    faviconFile: generalData.faviconFile || faviconLogo || null,
    marqueeText: generalData.marqueeText || scrollText || null,
    metaTitle: generalData.metaTitle || null,
    metaKeyword: generalData.metaKeyword || null,
    metaDescription: generalData.metaDescription || null,
    bkashNumber: generalData.bkashNumber || null,
    nagadNumber: generalData.nagadNumber || null,
    rocketNumber: generalData.rocketNumber || null,
    deliveryPolicyTitle: generalData.deliveryPolicyTitle || null,
    deliveryPolicy: generalData.deliveryPolicy || null,
    orderBlockLimit: generalData.orderBlockLimit || null,
    blockTime: generalData.blockTime || null,
    timeUnit: generalData.timeUnit || null,
    status: generalData.status ?? true,
    ...socialMediaData,
    ...contactData,
    hotlineNumber: contactActive ? contactData.hotlineNumber || null : null,
    hotMail: contactActive ? contactData.hotMail || null : null,
    phoneNumber: contactActive ? contactData.phoneNumber || null : null,
    phone,
    email,
    address: contactActive ? contactData.address || null : null,
    whatsappNumber,
    whatsappUrl: socialMediaData.whatsappUrl || contactWhatsappUrl,
    mapLink: contactActive ? contactData.mapLink || null : null,
    header: headerData,
    footer: footerData,
    websiteFooter: websiteFooterData,
    reward: normalizeRewardSettings(normalizeSettingData(reward?.data)),
  };
};

const upsert = async (settingType, payload) => {
  const type = validateType(settingType);
  const rawData = payload?.data ?? payload;
  const data = await replaceInlineImages(
    type === "social_media"
      ? normalizeSocialMediaStorage(rawData)
      : normalizeSettingData(rawData),
  );
  const [row] = await db.siteSetting.findOrCreate({
    where: { settingType: type },
    defaults: { settingType: type, data },
  });
  if (!row.isNewRecord) await row.update({ data });
  return row;
};

module.exports = { getByType, getPublic, upsert };
