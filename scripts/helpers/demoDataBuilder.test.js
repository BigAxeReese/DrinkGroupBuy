"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEMO_PREFIX, DEMO_MERCHANT_ID, buildDemoData } = require("./demoDataBuilder");

const NOW = new Date("2026-09-25T04:00:00.000Z");
const stores = [
  { id: "store-a", name: "甲店" },
  { id: "store-b", name: "乙店" },
  { id: "store-c", name: "丙店" },
];
const menuItems = [
  { id: "m1", store_id: "store-a", name: "紅茶", base_price: 45 },
  { id: "m2", store_id: "store-a", name: "奶茶", base_price: 65 },
  { id: "m3", store_id: "store-b", name: "綠茶", base_price: 40 },
  { id: "m4", store_id: "store-c", name: "烏龍拿鐵", base_price: 75 },
];
const FOCUS = ["real-user-1", "real-user-2"];

function build(overrides = {}) {
  return buildDemoData({
    seed: 42, now: NOW, activityCount: 40, customerCount: 24, dayRange: 60,
    stores, menuItems, focusUserIds: FOCUS, ...overrides,
  });
}

const groupBy = (rows, key) => rows.reduce((map, row) => {
  (map.get(row[key]) || map.set(row[key], []).get(row[key])).push(row);
  return map;
}, new Map());

test("the same seed and clock always produce identical rows", () => {
  assert.deepEqual(build(), build());
  assert.notDeepEqual(build().orders, build({ seed: 43 }).orders);
});

test("every generated id is namespaced and unique within its table", () => {
  const data = build();
  for (const table of ["users", "activities", "tiers", "orders", "orderItems", "authorizations",
    "captures", "refunds", "credentials", "consents", "settlements", "userRoles"]) {
    const ids = data[table].map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length, `${table} has duplicate ids`);
    for (const id of ids) assert.ok(id.startsWith(DEMO_PREFIX), `${table} id ${id} lacks the demo prefix`);
  }
  for (const user of data.users) assert.match(user.email, /@example\.test$/);
});

test("rows reference each other correctly (no dangling foreign keys)", () => {
  const data = build();
  const userIds = new Set([...data.users.map((row) => row.id), ...FOCUS]);
  const activityIds = new Set(data.activities.map((row) => row.id));
  const orderIds = new Set(data.orders.map((row) => row.id));
  const authorizationIds = new Set(data.authorizations.map((row) => row.id));
  const captureIds = new Set(data.captures.map((row) => row.id));
  const tierIds = new Set(data.tiers.map((row) => row.id));
  const catalogItemIds = new Set(menuItems.map((row) => row.id));

  for (const activity of data.activities) {
    assert.equal(activity.created_by_user_id, DEMO_MERCHANT_ID);
    assert.ok(stores.some((store) => store.id === activity.store_id));
  }
  for (const tier of data.tiers) assert.ok(activityIds.has(tier.activity_id));
  for (const order of data.orders) {
    assert.ok(activityIds.has(order.activity_id));
    assert.ok(userIds.has(order.customer_user_id));
  }
  for (const item of data.orderItems) {
    assert.ok(orderIds.has(item.order_id));
    assert.ok(catalogItemIds.has(item.menu_item_id));
  }
  for (const row of [...data.authorizations, ...data.captures, ...data.credentials, ...data.consents]) {
    assert.ok(orderIds.has(row.order_id));
  }
  for (const capture of data.captures) assert.ok(authorizationIds.has(capture.payment_authorization_id));
  for (const refund of data.refunds) {
    assert.ok(captureIds.has(refund.payment_capture_id));
    assert.ok(authorizationIds.has(refund.payment_authorization_id));
  }
  for (const settlement of data.settlements) {
    assert.ok(activityIds.has(settlement.activity_id));
    if (settlement.applied_tier_id) assert.ok(tierIds.has(settlement.applied_tier_id));
  }
});

test("order amounts add up and every payment is a mock provider", () => {
  const data = build();
  const itemsByOrder = groupBy(data.orderItems, "order_id");
  for (const order of data.orders) {
    const items = itemsByOrder.get(order.id);
    assert.ok(items && items.length > 0, `${order.id} has no items`);
    assert.equal(items.reduce((sum, item) => sum + item.subtotal, 0), order.original_amount);
    assert.equal(items.reduce((sum, item) => sum + item.quantity, 0), order.total_cups);
    for (const item of items) assert.equal(item.subtotal, item.unit_price_snapshot * item.quantity);
  }
  for (const authorization of data.authorizations) assert.equal(authorization.provider, "mock_line_pay");
  for (const refund of data.refunds) assert.equal(refund.provider, "mock_line_pay");
});

test("qualified group buys charge exactly what real settlement would (percentage off, rounded up)", () => {
  const data = build();
  const ordersByActivity = groupBy(data.orders, "activity_id");
  const capturesByOrder = new Map(data.captures.map((capture) => [capture.order_id, capture]));
  let checked = 0;
  for (const settlement of data.settlements.filter((row) => row.outcome === "qualified")) {
    const orders = ordersByActivity.get(settlement.activity_id);
    const cups = orders.reduce((sum, order) => sum + order.total_cups, 0);
    assert.equal(settlement.authorized_cups, cups);
    const tiers = data.tiers.filter((tier) => tier.activity_id === settlement.activity_id);
    const applied = tiers.filter((tier) => cups >= tier.target_cups).at(-1);
    assert.equal(settlement.applied_tier_id, applied.id);
    assert.equal(settlement.discount_percent, applied.discount_percent);
    assert.equal(settlement.calculation_version, "percentage_v1");

    let discountSum = 0;
    for (const order of orders) {
      const expectedFinal = Math.ceil((order.original_amount * (100 - applied.discount_percent)) / 100);
      assert.equal(order.final_amount, expectedFinal, `${order.id} final amount`);
      const capture = capturesByOrder.get(order.id);
      assert.equal(capture.final_amount, expectedFinal);
      assert.equal(capture.capture_amount, expectedFinal);
      assert.equal(capture.released_amount, order.original_amount - expectedFinal);
      discountSum += order.original_amount - expectedFinal;
      checked += 1;
    }
    assert.equal(settlement.total_discount_amount, discountSum);
  }
  assert.ok(checked > 0, "expected at least one qualified activity with orders");
});

test("unqualified group buys stay below the first tier and carry no discount", () => {
  const data = build();
  const ordersByActivity = groupBy(data.orders, "activity_id");
  const failedSettlements = data.settlements.filter((row) => row.outcome === "failed");
  assert.ok(failedSettlements.length > 0);
  for (const settlement of failedSettlements) {
    const firstTarget = Math.min(...data.tiers
      .filter((tier) => tier.activity_id === settlement.activity_id).map((tier) => tier.target_cups));
    assert.ok(settlement.authorized_cups < firstTarget);
    assert.equal(settlement.applied_tier_id, null);
    assert.equal(settlement.discount_percent, null);
    assert.equal(settlement.total_discount_amount, 0);
    for (const order of ordersByActivity.get(settlement.activity_id)) {
      if (order.payment_status === "captured") assert.equal(order.final_amount, order.original_amount);
    }
  }
});

test("cancelled activities have no settlement and every order is voided", () => {
  const data = build();
  const cancelled = data.activities.filter((activity) => activity.status === "cancelled");
  assert.ok(cancelled.length > 0);
  for (const activity of cancelled) {
    assert.ok(activity.cancellation_reason);
    assert.equal(data.settlements.some((row) => row.activity_id === activity.id), false);
    for (const order of data.orders.filter((row) => row.activity_id === activity.id)) {
      assert.equal(order.status, "cancelled");
      assert.equal(order.payment_status, "authorization_voided");
      assert.equal(order.final_amount, null);
    }
  }
});

test("activity status agrees with what its orders ended up as", () => {
  const data = build();
  const ordersByActivity = groupBy(data.orders, "activity_id");
  for (const activity of data.activities) {
    const orders = ordersByActivity.get(activity.id);
    const anyCaptured = orders.some((order) => ["captured", "refunded"].includes(order.payment_status));
    if (activity.status === "completed") assert.ok(anyCaptured);
    if (activity.status === "failed") assert.equal(anyCaptured, false);
    assert.ok(["completed", "failed", "cancelled"].includes(activity.status));
  }
});

test("pickups, credentials and refunds tell one consistent story per order", () => {
  const data = build();
  const credentialByOrder = new Map(data.credentials.map((row) => [row.order_id, row]));
  const refundByOrder = new Map(data.refunds.map((row) => [row.order_id, row]));
  for (const order of data.orders) {
    const credential = credentialByOrder.get(order.id);
    const refund = refundByOrder.get(order.id);
    if (!["captured", "refunded"].includes(order.payment_status)) {
      assert.equal(credential, undefined);
      assert.equal(refund, undefined);
      continue;
    }
    assert.equal(order.status, "completed");
    if (order.pickup_status === "picked_up") {
      assert.ok(credential.redeemed_at);
      assert.equal(credential.redeemed_by_user_id, DEMO_MERCHANT_ID);
      assert.equal(credential.expired_at, null);
    } else {
      assert.equal(order.pickup_status, "expired");
      assert.equal(credential.redeemed_at, null);
      assert.ok(credential.expired_at);
      assert.equal(refund, undefined);
    }
    if (order.payment_status === "refunded") assert.equal(refund.refund_amount, order.final_amount);
    else assert.equal(refund, undefined);
    assert.match(credential.pickup_code, /^\d{6}$/);
  }
});

test("dates are ordered and every activity is finished well before now", () => {
  const data = build();
  const activitiesById = new Map(data.activities.map((row) => [row.id, row]));
  const oneDayMs = 24 * 3_600_000;
  for (const activity of data.activities) {
    const start = Date.parse(activity.start_at);
    const deadline = Date.parse(activity.deadline_at);
    const pickupStart = Date.parse(activity.pickup_start_at);
    const pickupEnd = Date.parse(activity.pickup_end_at);
    assert.ok(start < deadline && deadline < pickupStart && pickupStart < pickupEnd);
    assert.ok(pickupEnd < NOW.getTime() - oneDayMs, "pickup window should be long over");
    assert.ok(Date.parse(activity.updated_at) < NOW.getTime());
    assert.ok(start > NOW.getTime() - 61 * oneDayMs);
  }
  for (const order of data.orders) {
    const activity = activitiesById.get(order.activity_id);
    const submitted = Date.parse(order.submitted_at);
    assert.ok(submitted >= Date.parse(activity.start_at) && submitted <= Date.parse(activity.deadline_at));
    assert.ok(Date.parse(order.updated_at) >= submitted);
  }
});

test("no customer has two orders in the same group buy, and real (focus) users take part often", () => {
  const data = build();
  const seen = new Set();
  for (const order of data.orders) {
    const key = `${order.activity_id}|${order.customer_user_id}`;
    assert.equal(seen.has(key), false, `duplicate order for ${key}`);
    seen.add(key);
  }
  for (const focusId of FOCUS) {
    const joined = data.orders.filter((order) => order.customer_user_id === focusId).length;
    assert.ok(joined >= data.activities.length * 0.4, `${focusId} joined only ${joined}`);
  }
});

test("the mix contains every kind of outcome the app can show", () => {
  const summary = build().summary;
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.ok(summary.activitiesByStatus[status] > 0, `no ${status} activities`);
  }
  const data = build();
  assert.ok(data.orders.some((order) => order.pickup_status === "expired"));
  assert.ok(data.orders.some((order) => order.payment_status === "refunded"));
  assert.ok(summary.totalDiscount > 0);
});

test("bad inputs are rejected instead of producing odd data", () => {
  assert.throws(() => build({ stores: [] }), /open store/);
  assert.throws(() => build({ menuItems: [] }), /available menu/);
  assert.throws(() => build({ customerCount: 3 }), /at least 12/);
  assert.throws(() => build({ dayRange: 2 }), /at least 7/);
  assert.throws(() => build({ activityCount: 0 }), /positive integer/);
});
