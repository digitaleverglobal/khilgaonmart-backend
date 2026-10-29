// Customer reward points: earned on delivered orders and one-time bonuses, spent
// as a checkout discount, expiring after a while. Membership tiers multiply
// earned points. Rates live in the "reward" site setting
// (admin › Website › Customer Reward).
const { Op, fn, col } = require("sequelize");
const ApiError = require("../../../error/ApiError");
const db = require("../../../models");
const SiteSettingService = require("../siteSetting/siteSetting.service");
const SmsMarketingService = require("../smsMarketing/smsMarketing.service");
const { normalizeCustomerPhone } = require("../customer/customerSync");
const { normalizeRewardSettings } = require("./reward.settings");
const { ORDER_STATUS, RETURN_STATUSES } = require("../order/order.constants");

const RewardTransaction = db.rewardTransaction;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_WINDOW_MONTHS = 12;

const getRewardSettings = async () => {
  const row = await SiteSettingService.getByType("reward").catch(() => null);
  return normalizeRewardSettings(row?.data || {});
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

// Orders store the phone as typed, so match the common spellings of a number.
const phoneSpellings = (phone) => [phone, `88${phone}`, `+88${phone}`];

const customerCode = (id) => `C-${String(id).padStart(4, "0")}`;

const parseCustomerCode = (code) => {
  const match = String(code || "").trim().match(/^c-?0*(\d+)$/i);
  return match ? Number(match[1]) : null;
};

// Not the OTP sender: that one refuses when OTP verification is switched off.
const sendSms = (phone, text) =>
  SmsMarketingService.sendSmsToRecipients([{ phone }], text).catch((error) =>
    console.error("Reward SMS failed:", error.message),
  );

// ── Ledger ────────────────────────────────────────────────────────────────

const getBalance = async (phone, transaction) => {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized) return 0;
  const total = await RewardTransaction.sum("points", { where: { phone: normalized }, transaction });
  return Math.max(0, Number(total) || 0);
};

// Adds a ledger row. Positive rows get an expiry date; a repeated one-time
// entry (same order+type or same phone+refKey) is ignored. Returns the row or null.
const addEntry = async (entry, settings, options = {}) => {
  const expiresAt = entry.points > 0 && settings.expiryMonths > 0
    ? addMonths(new Date(), settings.expiryMonths)
    : null;
  try {
    return await RewardTransaction.create({ ...entry, expiresAt }, options);
  } catch (error) {
    if (error.name !== "SequelizeUniqueConstraintError") throw error;
    return null;
  }
};

// What's left of each positive row after spending, oldest first (FIFO).
const remainingByEntry = (rows) => {
  const positives = rows
    .filter((row) => row.points > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.Id - b.Id)
    .map((row) => ({ ...row, remaining: row.points }));
  let spent = rows.filter((row) => row.points < 0).reduce((sum, row) => sum - row.points, 0);
  for (const row of positives) {
    if (spent <= 0) break;
    const used = Math.min(row.remaining, spent);
    row.remaining -= used;
    spent -= used;
  }
  return positives;
};

const getLedger = (phone) =>
  RewardTransaction.findAll({ where: { phone }, order: [["Id", "ASC"]], raw: true });

// ── Tiers ─────────────────────────────────────────────────────────────────

// Delivered orders' total over the last 12 months.
const getRecentSpend = async (phone) => {
  const total = await db.order.sum("totalBill", {
    where: {
      customerPhone: { [Op.in]: phoneSpellings(phone) },
      status: ORDER_STATUS.DELIVERED,
      createdAt: { [Op.gte]: addMonths(new Date(), -TIER_WINDOW_MONTHS) },
    },
  });
  return Number(total) || 0;
};

const getTierInfo = async (phone, settings) => {
  if (!settings.tiersEnabled) return null;
  const spend = await getRecentSpend(phone);
  const tiers = settings.tiers;
  let index = 0;
  tiers.forEach((tier, i) => { if (spend >= tier.minSpend) index = i; });
  const next = tiers[index + 1] || null;
  return {
    current: tiers[index],
    next,
    spend,
    remainingToNext: next ? Math.max(0, next.minSpend - spend) : 0,
    tiers,
  };
};

// ── Checkout ──────────────────────────────────────────────────────────────

// How many of the requested points can be spent on an order, and their taka value.
const planRedemption = ({ requestedPoints, balance, payableProducts, settings }) => {
  const requested = Math.floor(Number(requestedPoints) || 0);
  if (!settings.enabled || requested <= 0) return null;
  const maxDiscount = Math.max(0, payableProducts) * (settings.maxRedeemPercent / 100);
  const points = Math.min(requested, balance, Math.floor(maxDiscount / settings.pointValue));
  if (points < settings.minRedeemPoints) {
    throw new ApiError(400, `কমপক্ষে ${settings.minRedeemPoints} পয়েন্ট ব্যবহার করতে হবে`);
  }
  return { points, discount: Math.round(points * settings.pointValue * 100) / 100 };
};

// Applies a logged-in customer's tier free delivery and reward points to a
// priced order payload (after coupons). Guests and other phones get neither.
const applyRewardRedemption = async (payload, customerPhone) => {
  const requested = Math.floor(Number(payload.redeemPoints) || 0);
  const phone = normalizeCustomerPhone(customerPhone);
  const ownPhone = Boolean(phone) && phone === normalizeCustomerPhone(payload.customerPhone);
  if (requested > 0 && !ownPhone) {
    throw new ApiError(403, "পয়েন্ট ব্যবহার করতে নিজের ফোন নাম্বার দিয়ে লগইন করুন");
  }
  if (!ownPhone) return payload;

  const settings = await getRewardSettings();
  if (!settings.enabled) return payload;
  let next = { ...payload };

  const tier = await getTierInfo(phone, settings);
  if (tier?.current.freeDelivery && Number(next.deliveryCharge) > 0) {
    next = { ...next, deliveryCharge: 0, tierFreeDelivery: tier.current.name };
  }

  if (requested > 0) {
    const balance = await getBalance(phone);
    const subtotal = Number(next.subtotal || 0);
    const discount = Number(next.discount || 0);
    const plan = planRedemption({ requestedPoints: requested, balance, payableProducts: subtotal - discount, settings });
    if (plan) {
      next = {
        ...next,
        discount: discount + plan.discount,
        rewardPoints: plan.points,
        rewardDiscount: plan.discount,
      };
    }
  }

  return {
    ...next,
    total: Math.max(0, Number(next.subtotal || 0) + Number(next.deliveryCharge || 0) - Number(next.discount || 0)),
  };
};

// Records the spent points inside the order's transaction; fails the order if the
// balance was spent elsewhere in the meantime.
const recordRedemption = async (order, points, transaction) => {
  if (!points) return;
  const phone = normalizeCustomerPhone(order.customerPhone);
  const balance = await getBalance(phone, transaction);
  if (balance < points) throw new ApiError(400, "পর্যাপ্ত রিওয়ার্ড পয়েন্ট নেই");
  await RewardTransaction.create(
    { phone, orderId: order.Id, type: "redeem", points: -points, note: `Used on ${order.orderId}` },
    { transaction },
  );
};

// ── Order status changes ──────────────────────────────────────────────────

const parseMeta = (note) => {
  try {
    const meta = JSON.parse(note || "");
    return meta && typeof meta === "object" ? meta : {};
  } catch {
    return {};
  }
};

// Taka the customer paid for products (no delivery charge, after discounts).
const productAmount = (order) => {
  const meta = parseMeta(order.note);
  if (meta.subtotal !== undefined) return Number(meta.subtotal || 0) - Number(meta.discount || 0);
  return Number(order.totalBill || 0) - Number(meta.deliveryCharge || 0);
};

const findEntry = (orderId, type) => RewardTransaction.findOne({ where: { orderId, type } });

const awardDelivery = async (order, phone, settings) => {
  const tier = await getTierInfo(phone, settings);
  const multiplier = tier?.current.multiplier || 1;
  const basePoints = Math.floor(productAmount(order) / settings.earnAmount) * settings.earnPoints;
  const points = Math.floor(basePoints * multiplier);
  let earned = 0;

  if (points > 0 && !(await findEntry(order.Id, "earn"))) {
    const note = multiplier > 1
      ? `Earned on ${order.orderId} (${tier.current.name} ${multiplier}x)`
      : `Earned on ${order.orderId}`;
    if (await addEntry({ phone, orderId: order.Id, type: "earn", points, note }, settings)) earned += points;
  }

  // Only for a customer whose first-ever delivered order this is, not long-time
  // customers ordering after the program was switched on.
  const deliveredCount = settings.firstOrderBonus > 0
    ? await db.order.count({
      where: { customerPhone: { [Op.in]: phoneSpellings(phone) }, status: ORDER_STATUS.DELIVERED },
    })
    : 0;
  if (settings.firstOrderBonus > 0 && deliveredCount === 1) {
    const row = await addEntry({
      phone, orderId: order.Id, type: "bonus_first_order", points: settings.firstOrderBonus,
      refKey: "first_order", note: `First order bonus (${order.orderId})`,
    }, settings);
    if (row) earned += row.points;
  }

  // Referral: both customers get the bonus on the new customer's first delivery.
  if (settings.referralBonus > 0) {
    const customer = await db.customer.findOne({ where: { phone }, attributes: ["Id", "referredById"] });
    const referrer = customer?.referredById
      ? await db.customer.findByPk(customer.referredById, { attributes: ["Id", "phone"] })
      : null;
    if (referrer && referrer.phone !== phone) {
      const row = await addEntry({
        phone, orderId: null, type: "bonus_referral", points: settings.referralBonus,
        refKey: "referral_joined", note: `Referral bonus (${customerCode(referrer.Id)})`,
      }, settings);
      if (row) {
        earned += row.points;
        await addEntry({
          phone: referrer.phone, orderId: null, type: "bonus_referral", points: settings.referralBonus,
          refKey: `referral:${phone}`, note: `Referred ${customerCode(customer.Id)}`,
        }, settings);
      }
    }
  }

  if (earned > 0 && settings.smsEnabled) {
    const balance = await getBalance(phone);
    sendSms(phone, `অভিনন্দন! অর্ডার ${order.orderId} এ আপনি ${earned} রিওয়ার্ড পয়েন্ট পেয়েছেন। মোট পয়েন্ট: ${balance}`);
  }
};

const syncOrderRewards = async (order, previousStatus) => {
  const phone = normalizeCustomerPhone(order.customerPhone);
  if (!phone) return;
  const status = order.status;
  const settings = await getRewardSettings();

  if (status === ORDER_STATUS.DELIVERED) {
    if (settings.enabled) await awardDelivery(order, phone, settings);
  } else if (previousStatus === ORDER_STATUS.DELIVERED) {
    const earned = await findEntry(order.Id, "earn");
    if (earned && !(await findEntry(order.Id, "earn_reversal"))) {
      await addEntry({
        phone: earned.phone, orderId: order.Id, type: "earn_reversal",
        points: -earned.points, note: `${order.orderId} is no longer delivered`,
      }, settings);
    }
  }

  if ([ORDER_STATUS.CANCELLED, ...RETURN_STATUSES].includes(status)) {
    const spent = await findEntry(order.Id, "redeem");
    if (spent && !(await findEntry(order.Id, "redeem_refund"))) {
      await addEntry({
        phone: spent.phone, orderId: order.Id, type: "redeem_refund",
        points: -spent.points, note: `Returned from ${order.orderId}`,
      }, settings);
    }
  }
};

const registerRewardHooks = (Order) => {
  Order.addHook("afterUpdate", "rewardPoints", (order, options = {}) => {
    if (!order.changed("status")) return;
    const previousStatus = order.previous("status");
    const run = () =>
      syncOrderRewards(order, previousStatus).catch((error) =>
        console.error("Reward points sync failed:", error.message),
      );
    if (options.transaction) options.transaction.afterCommit(run);
    else run();
  });
};

// ── Bonuses outside orders ────────────────────────────────────────────────

// New account: link a referral and add the sign-up bonus. Referrals only count
// for phones that have never ordered before.
const handleSignup = async (customerPhone, referralCode, name) => {
  const phone = normalizeCustomerPhone(customerPhone);
  if (!phone) return;
  const settings = await getRewardSettings();

  const [customer, created] = await db.customer.findOrCreate({
    where: { phone },
    defaults: { phone, name: String(name || "").trim() || null },
  });
  const referrerId = parseCustomerCode(referralCode);
  if (created && referrerId && referrerId !== customer.Id) {
    const referrer = await db.customer.findByPk(referrerId, { attributes: ["Id", "phone"] });
    if (referrer && referrer.phone !== phone) await customer.update({ referredById: referrer.Id });
  }

  if (settings.enabled && settings.signupBonus > 0) {
    await addEntry({
      phone, type: "bonus_signup", points: settings.signupBonus,
      refKey: "signup", note: "Sign-up bonus",
    }, settings);
  }
};

// An approved customer review earns the bonus once per product.
const awardReviewBonus = async (review) => {
  const phone = normalizeCustomerPhone(review?.customerPhone);
  if (!phone || review.status !== "approved") return;
  const settings = await getRewardSettings();
  if (!settings.enabled || settings.reviewBonus <= 0) return;
  await addEntry({
    phone, type: "bonus_review", points: settings.reviewBonus,
    refKey: `review:${review.productId || review.Id}`,
    note: `Review: ${String(review.productName || "").slice(0, 120)}`,
  }, settings);
};

// Staff correction, e.g. compensation for a complaint.
const adjustPoints = async (customerPhone, points, note, actor = {}) => {
  const phone = normalizeCustomerPhone(customerPhone);
  const amount = Math.trunc(Number(points) || 0);
  if (!phone) throw new ApiError(400, "Customer phone is required");
  if (!amount) throw new ApiError(400, "Points must be a non-zero whole number");
  const reason = String(note || "").trim();
  if (!reason) throw new ApiError(400, "Please write a reason");
  if (amount < 0 && (await getBalance(phone)) + amount < 0) {
    throw new ApiError(400, "Balance can't go below zero");
  }
  const settings = await getRewardSettings();
  const by = [actor.FirstName, actor.LastName].filter(Boolean).join(" ") || actor.Email || "Staff";
  await addEntry({ phone, type: "adjust", points: amount, note: `${reason} — ${by}`.slice(0, 255) }, settings);
  return getCustomerRewards(phone);
};

// ── Expiry ────────────────────────────────────────────────────────────────

const phonesWith = async (where) =>
  (await RewardTransaction.findAll({ attributes: ["phone"], where, group: ["phone"], raw: true }))
    .map((row) => row.phone);

// Turns whatever is left of expired rows into one "expire" row per customer.
const processExpiredPoints = async () => {
  const now = new Date();
  const phones = await phonesWith({
    points: { [Op.gt]: 0 }, expiresAt: { [Op.lte]: now }, expiryChecked: false,
  });
  let expired = 0;
  for (const phone of phones) {
    const due = remainingByEntry(await getLedger(phone))
      .filter((row) => row.expiresAt && new Date(row.expiresAt) <= now);
    const points = due.reduce((sum, row) => sum + row.remaining, 0);
    if (points > 0) {
      await RewardTransaction.create({ phone, type: "expire", points: -points, note: "Points expired" });
      expired += points;
    }
    await RewardTransaction.update({ expiryChecked: true }, { where: { Id: due.map((row) => row.Id) } });
  }
  return expired;
};

const reminderDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// SMS once per row, `expiryReminderDays` before it expires.
const sendExpiryReminders = async () => {
  const settings = await getRewardSettings();
  if (!settings.enabled || !settings.smsEnabled || settings.expiryReminderDays <= 0) return 0;
  const now = new Date();
  const until = new Date(now.getTime() + settings.expiryReminderDays * DAY_MS);
  const phones = await phonesWith({
    points: { [Op.gt]: 0 }, expiresAt: { [Op.gt]: now, [Op.lte]: until },
    expiryChecked: false, reminderSent: false,
  });
  let sent = 0;
  for (const phone of phones) {
    const soon = remainingByEntry(await getLedger(phone))
      .filter((row) => !row.reminderSent && row.expiresAt && new Date(row.expiresAt) <= until);
    const points = soon.reduce((sum, row) => sum + row.remaining, 0);
    if (points > 0) {
      const firstDate = soon.find((row) => row.remaining > 0).expiresAt;
      sendSms(phone, `আপনার ${points} রিওয়ার্ড পয়েন্টের মেয়াদ ${reminderDate(firstDate)} তারিখে শেষ হবে। মেয়াদ শেষের আগে অর্ডারে ব্যবহার করুন।`);
      sent += 1;
    }
    await RewardTransaction.update({ reminderSent: true }, { where: { Id: soon.map((row) => row.Id) } });
  }
  return sent;
};

// ── Reading ───────────────────────────────────────────────────────────────

const EXPIRING_SOON_DAYS = 30;

// Balance, tier, what expires soon, referral code and history for one customer.
const getCustomerRewards = async (customerPhone) => {
  const phone = normalizeCustomerPhone(customerPhone);
  const settings = await getRewardSettings();
  const [ledger, tier, customer] = await Promise.all([
    phone ? getLedger(phone) : [],
    phone ? getTierInfo(phone, settings) : null,
    phone ? db.customer.findOrCreate({ where: { phone }, defaults: { phone } }).then(([row]) => row) : null,
  ]);
  const balance = Math.max(0, ledger.reduce((sum, row) => sum + row.points, 0));

  const soonLimit = new Date(Date.now() + EXPIRING_SOON_DAYS * DAY_MS);
  const expiring = remainingByEntry(ledger)
    .filter((row) => row.remaining > 0 && row.expiresAt && new Date(row.expiresAt) <= soonLimit);
  const expiringSoon = expiring.length
    ? { points: expiring.reduce((sum, row) => sum + row.remaining, 0), date: expiring[0].expiresAt }
    : null;

  const recent = ledger.slice(-100).reverse();
  const orderIds = [...new Set(recent.map((row) => row.orderId).filter(Boolean))];
  const orders = orderIds.length
    ? await db.order.findAll({ attributes: ["Id", "orderId"], where: { Id: orderIds }, raw: true })
    : [];
  const invoices = new Map(orders.map((order) => [order.Id, order.orderId]));

  return {
    settings,
    balance,
    balanceValue: Math.round(balance * settings.pointValue * 100) / 100,
    tier,
    expiringSoon,
    referralCode: customer ? customerCode(customer.Id) : null,
    transactions: recent.map((row) => ({
      Id: row.Id,
      type: row.type,
      points: row.points,
      note: row.note,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      invoiceId: invoices.get(row.orderId) || null,
    })),
  };
};

// Totals per phone for the admin customer list.
const getBalances = async (phones = []) => {
  const balances = new Map();
  if (!phones.length) return balances;
  const rows = await RewardTransaction.findAll({
    attributes: ["phone", [fn("SUM", col("points")), "balance"]],
    where: { phone: phones },
    group: ["phone"],
    raw: true,
  });
  rows.forEach((row) => balances.set(row.phone, Math.max(0, Number(row.balance) || 0)));
  return balances;
};

module.exports = {
  getRewardSettings,
  applyRewardRedemption,
  recordRedemption,
  registerRewardHooks,
  syncOrderRewards,
  handleSignup,
  awardReviewBonus,
  adjustPoints,
  processExpiredPoints,
  sendExpiryReminders,
  getCustomerRewards,
  getBalances,
  remainingByEntry,
};
