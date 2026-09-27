"use strict";

// Builds a believable, internally consistent set of DEMO rows (fake customers, finished group buys
// spread over the past weeks, their orders, payments, settlements and pickups) as plain objects
// keyed by database column name. It never touches a database: scripts/seed-demo-data.js reads the
// real store/menu catalog, calls this, and writes the rows.
//
// Money is computed with the SAME functions the real settlement uses (calculatePercentageDiscount /
// resolveAppliedDiscountTier / validateDiscountTierConfiguration), so a demo order's final_amount is
// exactly what production settlement would have produced -- not an approximation.
//
// Everything created here has an id starting with DEMO_PREFIX so it can be found and removed later.
// Payments use the 'mock_line_pay' provider so demo rows can never be mistaken for a real charge.

const {
  calculatePercentageDiscount,
  resolveAppliedDiscountTier,
  validateDiscountTierConfiguration,
} = require("../../backend/pricing/groupBuyDiscount");
const { getPickupOverdueRule } = require("../../backend/payments/orderRuleConsent");

const DEMO_PREFIX = "demo-seed-";
const DEMO_MERCHANT_ID = `${DEMO_PREFIX}merchant`;
const PAYMENT_PROVIDER = "mock_line_pay";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Discount ladders a merchant might realistically set: [{ targetCups, discountPercent }].
// discountPercent is percent OFF (10 = 9折). maximumCups always equals the highest target.
const TIER_PRESETS = [
  [{ targetCups: 10, discountPercent: 10 }, { targetCups: 20, discountPercent: 20 }],
  [{ targetCups: 12, discountPercent: 10 }, { targetCups: 24, discountPercent: 20 }, { targetCups: 36, discountPercent: 30 }],
  [{ targetCups: 8, discountPercent: 10 }, { targetCups: 16, discountPercent: 15 }],
  [{ targetCups: 15, discountPercent: 20 }],
  [{ targetCups: 10, discountPercent: 5 }, { targetCups: 20, discountPercent: 15 }, { targetCups: 30, discountPercent: 25 }],
];
const ACTIVITY_TITLES = ["下午茶團購", "週末揪團", "辦公室點心團", "宵夜場", "加班補給團", "提神特調團"];
const CANCEL_REASONS = ["店家臨時公休", "原料缺貨", "設備故障維修"];
const SURNAMES = ["王", "李", "張", "劉", "陳", "楊", "黃", "趙", "吳", "周", "徐", "孫", "馬", "朱", "胡", "林", "郭", "何", "高", "羅"];
const GIVEN_NAMES = [
  "怡君", "雅婷", "家豪", "冠宇", "宗翰", "詩涵", "佩珊", "俊傑", "柏翰", "欣怡", "子軒", "郁婷",
  "建宏", "佳穎", "承恩", "宜蓁", "庭瑋", "靜怡", "宇翔", "品妤", "書瑋", "若涵", "彥廷", "思妤",
];

function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const chance = (probability) => next() < probability;
  const pick = (list) => list[Math.floor(next() * list.length)];
  const shuffle = (list) => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  };
  return { next, int, chance, pick, shuffle };
}

const pad = (value, width) => String(value).padStart(width, "0");
const iso = (millis) => new Date(millis).toISOString();

function buildDemoData(input) {
  const {
    seed = 20260925,
    now = new Date(),
    activityCount = 30,
    customerCount = 24,
    dayRange = 60,
    stores,
    menuItems,
    focusUserIds = [],
  } = input;
  if (!Array.isArray(stores) || stores.length === 0) throw new Error("At least one open store with a menu is required");
  if (!Number.isInteger(activityCount) || activityCount < 1) throw new Error("activityCount must be a positive integer");
  if (!Number.isInteger(customerCount) || customerCount < 12) throw new Error("customerCount must be at least 12");
  if (!Number.isInteger(dayRange) || dayRange < 7) throw new Error("dayRange must be at least 7 days");

  const random = createRandom(seed);
  const nowMillis = now.getTime();
  const menuByStore = new Map();
  for (const item of menuItems) {
    if (!menuByStore.has(item.store_id)) menuByStore.set(item.store_id, []);
    menuByStore.get(item.store_id).push(item);
  }
  const eligibleStores = stores.filter((store) => (menuByStore.get(store.id) || []).length > 0);
  if (eligibleStores.length === 0) throw new Error("No store has an available menu item");

  const data = {
    users: [], userRoles: [], privateProfiles: [], publicProfiles: [],
    activities: [], tiers: [], orders: [], orderItems: [],
    authorizations: [], captures: [], refunds: [], credentials: [], consents: [], settlements: [],
  };

  const { customerIds } = addUsers(data, random, customerCount, nowMillis, dayRange);
  const participantPool = [...customerIds, ...focusUserIds];

  // A few stores are clearly more popular than others, so a "top stores" ranking is interesting.
  const rankedStores = random.shuffle(eligibleStores);
  const storeWeights = rankedStores.map((_, rank) => 1 / Math.pow(rank + 1, 0.9));
  const pickStore = () => {
    let roll = random.next() * storeWeights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < rankedStores.length; index += 1) {
      roll -= storeWeights[index];
      if (roll <= 0) return rankedStores[index];
    }
    return rankedStores[rankedStores.length - 1];
  };

  const scenarios = planScenarios(random, activityCount);
  scenarios.forEach((scenario, index) => {
    const store = pickStore();
    addActivity(data, {
      random, index: index + 1, scenario, store, nowMillis, dayRange,
      storeMenu: menuByStore.get(store.id), participantPool, focusUserIds,
    });
  });

  data.summary = summarize(data);
  return data;
}

function addUsers(data, random, customerCount, nowMillis, dayRange) {
  const customerIds = [];
  const addUser = (id, displayName, alias, email, role) => {
    // Accounts exist before the earliest demo group buy, so no order predates its customer.
    const createdAt = iso(nowMillis - random.int(dayRange + 3, dayRange + 40) * DAY_MS);
    data.users.push({
      id, login_name: null, phone_number: null, email, password_hash: null, firebase_uid: null,
      display_name: displayName, status: "active", phone_verified_at: null, email_verified_at: null,
      last_login_at: null, created_at: createdAt, updated_at: createdAt,
    });
    data.userRoles.push({ id: `${id}-role-${role}`, user_id: id, role, status: "active", granted_at: createdAt });
    data.privateProfiles.push({
      user_id: id, real_name: displayName, contact_phone: null, contact_email: email,
      created_at: createdAt, updated_at: createdAt,
    });
    data.publicProfiles.push({
      user_id: id, display_alias: alias, avatar_color: null, privacy_mode: "anonymous",
      created_at: createdAt, updated_at: createdAt,
    });
  };
  addUser(DEMO_MERCHANT_ID, "示範商家帳號", "示範商家", `${DEMO_MERCHANT_ID}@example.test`, "merchant");
  for (let index = 0; index < customerCount; index += 1) {
    const given = GIVEN_NAMES[(index * 7) % GIVEN_NAMES.length];
    const id = `${DEMO_PREFIX}customer-${pad(index + 1, 2)}`;
    addUser(id, `${SURNAMES[index % SURNAMES.length]}${given}`, given, `${id}@example.test`, "customer");
    customerIds.push(id);
  }
  return { customerIds };
}

// About 62% of group buys reach a discount tier, 25% fall short, 13% are cancelled by the store.
function planScenarios(random, activityCount) {
  const qualified = Math.round(activityCount * 0.62);
  const cancelled = Math.round(activityCount * 0.13);
  const scenarios = [
    ...Array(qualified).fill("qualified"),
    ...Array(cancelled).fill("cancelled"),
    ...Array(Math.max(0, activityCount - qualified - cancelled)).fill("unqualified"),
  ];
  return random.shuffle(scenarios);
}

function addActivity(data, ctx) {
  const { random, index, scenario, store, nowMillis, dayRange, storeMenu, participantPool, focusUserIds } = ctx;
  const activityId = `${DEMO_PREFIX}activity-${pad(index, 3)}`;
  const tierDefinitions = random.pick(TIER_PRESETS);
  const validation = validateDiscountTierConfiguration({
    tiers: tierDefinitions,
    maximumCups: tierDefinitions.at(-1).targetCups,
  });
  if (!validation.valid) throw new Error(`Demo tier preset is invalid: ${JSON.stringify(validation)}`);

  // Start on a day between 4 and dayRange days ago at a Taiwan business hour (UTC+8, 09:00-16:00).
  // Everything then finishes over a day before "now", so no pickup window is still open and the
  // server's schedulers (which only pick up recruiting/confirmed/ordering activities) skip it.
  const localMidnight = Math.floor((nowMillis - random.int(4, dayRange) * DAY_MS + 8 * HOUR_MS) / DAY_MS) * DAY_MS - 8 * HOUR_MS;
  const startAt = localMidnight + random.int(9, 16) * HOUR_MS;
  const deadlineAt = startAt + random.int(20, 44) * HOUR_MS;
  const pickupStartAt = deadlineAt + random.int(1, 6) * HOUR_MS;
  const pickupEndAt = pickupStartAt + 3 * HOUR_MS;
  const tiers = tierDefinitions.map((tier, order) => ({
    id: `${DEMO_PREFIX}tier-${pad(index, 3)}-${order + 1}`,
    activityId,
    targetCups: tier.targetCups,
    discountPercent: tier.discountPercent,
    sortOrder: order + 1,
  }));
  const firstTarget = tiers[0].targetCups;
  const lastTarget = tiers.at(-1).targetCups;

  const participants = chooseParticipants(random, participantPool, focusUserIds, scenario);
  // Some short-of-target group buys end with NOBODY willing to pay full price, so the whole
  // activity fails (rather than limping on with a few full-price orders).
  const forcedFallback = scenario === "unqualified" && random.chance(0.45) ? "decline_original_price" : undefined;
  const orderSpecs = [];
  let cups = 0;
  const cupGoal = scenario === "unqualified"
    ? random.int(Math.max(2, Math.floor(firstTarget * 0.3)), firstTarget - 1)
    : scenario === "cancelled"
      ? random.int(2, 8)
      : (random.chance(0.35) ? random.int(firstTarget, lastTarget) : firstTarget + random.int(0, 3));
  for (const customerId of participants) {
    if (cups >= cupGoal) break;
    const spec = buildOrderSpec(random, storeMenu, customerId, undefined, forcedFallback);
    // A group buy meant to fall short must actually stay below its first tier.
    if (scenario === "unqualified" && cups + spec.cups >= firstTarget) continue;
    cups += spec.cups;
    orderSpecs.push(spec);
  }
  // Focus (real) users are always seated first, so a very small group can still be empty; guarantee one order.
  if (orderSpecs.length === 0) orderSpecs.push(buildOrderSpec(random, storeMenu, participants[0], 1, forcedFallback));

  const authorizedCups = orderSpecs.reduce((sum, spec) => sum + spec.cups, 0);
  const applied = resolveAppliedDiscountTier(tiers.map((tier) => ({
    id: tier.id, targetCups: tier.targetCups, discountPercent: tier.discountPercent,
  })), authorizedCups);
  const appliedPercent = scenario === "cancelled" ? 0 : Number(applied.currentTierDiscountPercent || 0);
  const outcome = appliedPercent > 0 ? "qualified" : "failed";
  const settledAt = deadlineAt + 30_000;

  const orderRecords = orderSpecs.map((spec, orderIndex) => addOrder(data, {
    random, activityId, activityIndex: index, orderIndex: orderIndex + 1, spec, scenario, outcome,
    appliedPercent, startAt, deadlineAt, pickupStartAt, pickupEndAt, settledAt,
  }));

  const captured = orderRecords.filter((record) => record.captured);
  let status = "completed";
  if (scenario === "cancelled") status = "cancelled";
  else if (captured.length === 0) status = "failed";
  const lastEventAt = Math.max(deadlineAt, ...orderRecords.map((record) => record.lastEventAt));

  data.activities.push({
    id: activityId, store_id: store.id, created_by_user_id: DEMO_MERCHANT_ID,
    title: `${store.name} ${random.pick(ACTIVITY_TITLES)}`, status,
    start_at: iso(startAt), deadline_at: iso(deadlineAt),
    pickup_start_at: iso(pickupStartAt), pickup_end_at: iso(pickupEndAt),
    maximum_cups: lastTarget, withdrawal_lock_minutes: 30,
    cancellation_reason: scenario === "cancelled" ? random.pick(CANCEL_REASONS) : null,
    created_at: iso(startAt - 2 * HOUR_MS), updated_at: iso(lastEventAt),
  });
  for (const tier of tiers) {
    data.tiers.push({
      id: tier.id, activity_id: activityId, target_cups: tier.targetCups,
      sort_order: tier.sortOrder, discount_percent: tier.discountPercent,
    });
  }
  if (scenario !== "cancelled") {
    data.settlements.push({
      id: `${DEMO_PREFIX}settlement-${pad(index, 3)}`, activity_id: activityId, outcome,
      authorized_cups: authorizedCups,
      applied_tier_id: outcome === "qualified" ? applied.currentTierId : null,
      total_discount_amount: outcome === "qualified"
        ? captured.reduce((sum, record) => sum + record.discountAmount, 0)
        : 0,
      settled_at: iso(settledAt), reason: "deadline_settlement_completed",
      discount_funder: "merchant", calculation_version: "percentage_v1",
      discount_percent: outcome === "qualified" ? appliedPercent : null,
    });
  }
}

// Real (focus) customers take part in most group buys so their personal pages have plenty to show.
function chooseParticipants(random, pool, focusUserIds, scenario) {
  const focusChance = scenario === "cancelled" ? 0.4 : 0.7;
  const focus = focusUserIds.filter(() => random.chance(focusChance));
  const others = random.shuffle(pool.filter((id) => !focusUserIds.includes(id)));
  return [...focus, ...others];
}

function buildOrderSpec(random, storeMenu, customerId, forcedQuantity, forcedFallback) {
  const lineCount = Math.min(storeMenu.length, random.chance(0.3) ? 2 : 1);
  const lines = random.shuffle(storeMenu).slice(0, lineCount).map((item) => {
    const quantity = forcedQuantity || (random.chance(0.6) ? 1 : random.int(2, 3));
    return { item, quantity, subtotal: item.base_price * quantity };
  });
  return {
    customerId,
    lines,
    cups: lines.reduce((sum, line) => sum + line.quantity, 0),
    originalAmount: lines.reduce((sum, line) => sum + line.subtotal, 0),
    fallback: forcedFallback || (random.chance(0.55) ? "accept_original_price" : "decline_original_price"),
  };
}

function addOrder(data, ctx) {
  const { random, activityId, activityIndex, orderIndex, spec, scenario, outcome, appliedPercent } = ctx;
  const { startAt, deadlineAt, pickupStartAt, pickupEndAt, settledAt } = ctx;
  const key = `${pad(activityIndex, 3)}-${pad(orderIndex, 2)}`;
  const orderId = `${DEMO_PREFIX}order-${key}`;
  const authorizationId = `${DEMO_PREFIX}authorization-${key}`;
  const window = deadlineAt - startAt;
  // Roughly 40% of people order in the last stretch before the deadline.
  const submittedAt = startAt + Math.floor((random.chance(0.4) ? 0.85 + random.next() * 0.14 : random.next() * 0.85) * window);
  const authorizedAt = submittedAt + random.int(1, 3) * 60_000;

  // Outcome of THIS order once the activity has been settled.
  let capturedAmount = null;
  if (scenario !== "cancelled") {
    if (outcome === "qualified") capturedAmount = calculatePercentageDiscount(spec.originalAmount, appliedPercent).finalAmount;
    else if (spec.fallback === "accept_original_price") capturedAmount = spec.originalAmount;
  }
  const captured = capturedAmount !== null;

  let order;
  let lastEventAt;
  if (!captured) {
    lastEventAt = scenario === "cancelled" ? deadlineAt - random.int(1, 6) * HOUR_MS : settledAt;
    lastEventAt = Math.max(lastEventAt, authorizedAt);
    order = { status: "cancelled", payment: "authorization_voided", pickup: "cancelled", acceptance: "cancelled", final: null };
  } else {
    // Most people collect their drinks; a few never show up (no refund, as the pickup rule says);
    // a few are fully refunded after collecting (e.g. a wrong drink).
    const roll = random.next();
    const pickupOutcome = roll < 0.88 ? "picked_up" : (roll < 0.96 ? "expired" : "refunded");
    const redeemed = pickupOutcome !== "expired";
    const redeemedAt = pickupStartAt + random.int(10, 150) * 60_000;
    const refundedAt = pickupOutcome === "refunded" ? redeemedAt + random.int(20, 240) * 60_000 : null;
    lastEventAt = refundedAt || (redeemed ? redeemedAt : pickupEndAt + 3 * HOUR_MS);
    order = {
      status: "completed",
      payment: pickupOutcome === "refunded" ? "refunded" : "captured",
      pickup: redeemed ? "picked_up" : "expired",
      acceptance: "accepted",
      final: capturedAmount,
      redeemed, redeemedAt, refundedAt,
    };
  }

  data.orders.push({
    id: orderId, activity_id: activityId, customer_user_id: spec.customerId, status: order.status,
    fallback_purchase_preference: spec.fallback, total_cups: spec.cups,
    original_amount: spec.originalAmount, final_amount: order.final, payment_status: order.payment,
    authorization_status: order.payment === "authorization_voided" ? "authorization_voided" : "captured",
    merchant_acceptance_status: order.acceptance, pickup_status: order.pickup,
    submitted_at: iso(submittedAt), updated_at: iso(lastEventAt),
  });
  spec.lines.forEach((line, lineIndex) => {
    data.orderItems.push({
      id: `${DEMO_PREFIX}order-item-${key}-${lineIndex + 1}`, order_id: orderId, menu_item_id: line.item.id,
      item_name_snapshot: line.item.name, quantity: line.quantity,
      unit_price_snapshot: line.item.base_price, subtotal: line.subtotal,
    });
  });
  data.consents.push({
    id: `${DEMO_PREFIX}consent-${key}`, order_id: orderId, customer_user_id: spec.customerId,
    rule_type: "pickup_overdue", rule_version: getPickupOverdueRule().ruleVersion,
    rule_content_snapshot: getPickupOverdueRule().content, consented_at: iso(submittedAt),
  });
  data.authorizations.push({
    id: authorizationId, order_id: orderId, provider: PAYMENT_PROVIDER, payment_flow: "authorization",
    status: captured ? "captured" : "authorization_voided",
    original_amount: spec.originalAmount, authorized_amount: spec.originalAmount,
    provider_authorization_id: `${DEMO_PREFIX}tx-${key}`, expires_at: iso(deadlineAt + 7 * DAY_MS),
    authorized_at: iso(authorizedAt), voided_at: captured ? null : iso(lastEventAt),
    failure_reason: null, created_at: iso(submittedAt), updated_at: iso(captured ? settledAt : lastEventAt),
    order_revision_id: null,
  });

  let discountAmount = 0;
  if (captured) {
    discountAmount = spec.originalAmount - capturedAmount;
    const captureId = `${DEMO_PREFIX}capture-${key}`;
    data.captures.push({
      id: captureId, payment_authorization_id: authorizationId, order_id: orderId, status: "captured",
      final_amount: capturedAmount, capture_amount: capturedAmount, released_amount: discountAmount,
      provider_capture_id: `${DEMO_PREFIX}cap-${key}`, captured_at: iso(settledAt), failure_reason: null,
      attempt_number: 1, retryable: false, next_retry_at: null,
      created_at: iso(settledAt), updated_at: iso(settledAt),
    });
    data.credentials.push({
      id: `${DEMO_PREFIX}credential-${key}`, order_id: orderId,
      pickup_code: pad(Math.floor(random.next() * 1_000_000), 6), visible_after_merchant_acceptance: true,
      expires_at: iso(pickupStartAt + 3 * HOUR_MS),
      expired_at: order.redeemed ? null : iso(pickupStartAt + 3 * HOUR_MS),
      redeemed_at: order.redeemed ? iso(order.redeemedAt) : null,
      redeemed_by_user_id: order.redeemed ? DEMO_MERCHANT_ID : null,
      created_at: iso(pickupStartAt - HOUR_MS),
    });
    if (order.refundedAt) {
      const refundedAt = order.refundedAt;
      data.refunds.push({
        id: `${DEMO_PREFIX}refund-${key}`, payment_capture_id: captureId, payment_authorization_id: authorizationId,
        order_id: orderId, provider: PAYMENT_PROVIDER, status: "refunded", refund_amount: capturedAmount,
        provider_refund_id: `${DEMO_PREFIX}rf-${key}`, idempotency_key: `${DEMO_PREFIX}refund-key-${key}`,
        refunded_at: iso(refundedAt), failure_reason: null,
        created_at: iso(refundedAt), updated_at: iso(refundedAt),
      });
    }
  }
  return { captured, discountAmount, lastEventAt };
}

function summarize(data) {
  const byStatus = {};
  for (const activity of data.activities) byStatus[activity.status] = (byStatus[activity.status] || 0) + 1;
  const counted = data.orders.filter((order) => order.payment_status === "captured" && order.pickup_status !== "expired");
  return {
    users: data.users.length,
    activities: data.activities.length,
    activitiesByStatus: byStatus,
    orders: data.orders.length,
    capturedOrders: data.orders.filter((order) => order.payment_status === "captured").length,
    totalRevenue: data.captures.reduce((sum, capture) => sum + capture.capture_amount, 0),
    totalDiscount: counted.reduce((sum, order) => sum + (order.original_amount - order.final_amount), 0),
    rows: Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([name, rows]) => [name, rows.length])),
  };
}

module.exports = { DEMO_PREFIX, DEMO_MERCHANT_ID, buildDemoData };
