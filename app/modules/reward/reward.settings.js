// Reward rates from the "reward" site setting, with safe defaults.
// No dependencies, so both siteSetting and reward services can use it.
const DEFAULT_TIERS = [
  { name: "Silver", minSpend: 0, multiplier: 1, freeDelivery: false },
  { name: "Gold", minSpend: 10000, multiplier: 1.5, freeDelivery: false },
  { name: "Platinum", minSpend: 30000, multiplier: 2, freeDelivery: true },
];

const DEFAULT_REWARD_SETTINGS = {
  enabled: false,
  // Every `earnAmount` taka of delivered products earns `earnPoints` points.
  earnAmount: 100,
  earnPoints: 1,
  // One point is worth `pointValue` taka at checkout.
  pointValue: 1,
  minRedeemPoints: 10,
  // Points can pay for at most this % of the products' price.
  maxRedeemPercent: 20,
  // Points expire this many months after they're added (0 = never).
  expiryMonths: 12,
  // SMS this many days before points expire.
  expiryReminderDays: 7,
  // One-time bonuses (0 = off).
  signupBonus: 20,
  firstOrderBonus: 50,
  reviewBonus: 5,
  // Both the referrer and the new customer get this when the new customer's
  // first order is delivered.
  referralBonus: 100,
  // SMS for points earned on delivery and for expiry reminders.
  smsEnabled: true,
  // Membership levels by delivered spend over the last 12 months.
  tiersEnabled: true,
  tiers: DEFAULT_TIERS,
};

const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

// Allows 0 (meaning "off" or "never").
const wholeNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const booleanSetting = (value, fallback) =>
  value === undefined || value === null ? fallback : value === true || value === "true";

const normalizeTiers = (value) => {
  if (!Array.isArray(value) || !value.length) return DEFAULT_TIERS;
  const tiers = value
    .filter((tier) => tier && String(tier.name || "").trim())
    .map((tier) => ({
      name: String(tier.name).trim().slice(0, 40),
      minSpend: wholeNumber(tier.minSpend, 0),
      multiplier: positiveNumber(tier.multiplier, 1),
      freeDelivery: tier.freeDelivery === true || tier.freeDelivery === "true",
    }))
    .sort((a, b) => a.minSpend - b.minSpend);
  if (!tiers.length) return DEFAULT_TIERS;
  // The lowest tier is where every customer starts.
  tiers[0].minSpend = 0;
  return tiers;
};

const normalizeRewardSettings = (data = {}) => ({
  enabled: data.enabled === true || data.enabled === "true",
  earnAmount: positiveNumber(data.earnAmount, DEFAULT_REWARD_SETTINGS.earnAmount),
  earnPoints: Math.floor(positiveNumber(data.earnPoints, DEFAULT_REWARD_SETTINGS.earnPoints)),
  pointValue: positiveNumber(data.pointValue, DEFAULT_REWARD_SETTINGS.pointValue),
  minRedeemPoints: Math.floor(positiveNumber(data.minRedeemPoints, DEFAULT_REWARD_SETTINGS.minRedeemPoints)),
  maxRedeemPercent: Math.min(100, positiveNumber(data.maxRedeemPercent, DEFAULT_REWARD_SETTINGS.maxRedeemPercent)),
  expiryMonths: wholeNumber(data.expiryMonths, DEFAULT_REWARD_SETTINGS.expiryMonths),
  expiryReminderDays: wholeNumber(data.expiryReminderDays, DEFAULT_REWARD_SETTINGS.expiryReminderDays),
  signupBonus: wholeNumber(data.signupBonus, DEFAULT_REWARD_SETTINGS.signupBonus),
  firstOrderBonus: wholeNumber(data.firstOrderBonus, DEFAULT_REWARD_SETTINGS.firstOrderBonus),
  reviewBonus: wholeNumber(data.reviewBonus, DEFAULT_REWARD_SETTINGS.reviewBonus),
  referralBonus: wholeNumber(data.referralBonus, DEFAULT_REWARD_SETTINGS.referralBonus),
  smsEnabled: booleanSetting(data.smsEnabled, DEFAULT_REWARD_SETTINGS.smsEnabled),
  tiersEnabled: booleanSetting(data.tiersEnabled, DEFAULT_REWARD_SETTINGS.tiersEnabled),
  tiers: normalizeTiers(data.tiers),
});

module.exports = { DEFAULT_REWARD_SETTINGS, normalizeRewardSettings };
