"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { settleGroupBuyActivity, buildGroupBuyQualifiedNotification } = require("./settlementService");

// The notification call is deliberately fire-and-forget (not awaited) so a slow/unavailable Expo
// push API can't add latency to the settlement caller's response -- see settlementService.js's
// comment at the notifyUsers(...) call site. Tests that assert on the resulting fetch call need to
// let that background promise chain finish first; setImmediate yields past the microtask queue.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("buildGroupBuyQualifiedNotification collects deduped customer ids and includes the activity title", () => {
  const plan = {
    activity: { id: "activity-1", title: "手搖飲團購" },
    orders: [
      { id: "order-1", customerUserId: "user-1", action: "already_captured" },
      { id: "order-2", customerUserId: "user-2", action: "already_captured" },
      { id: "order-3", customerUserId: "user-1", action: "already_captured" },
      { id: "order-4", customerUserId: null, action: "already_captured" },
    ],
  };

  const notification = buildGroupBuyQualifiedNotification(plan, []);

  assert.deepEqual(notification.userIds, ["user-1", "user-2"]);
  assert.equal(notification.title, "團購成團囉！");
  assert.match(notification.body, /手搖飲團購/);
  assert.deepEqual(notification.data, { type: "group_buy_qualified", activityId: "activity-1" });
});

test("buildGroupBuyQualifiedNotification falls back to generic wording when the activity has no title", () => {
  const notification = buildGroupBuyQualifiedNotification({
    activity: { id: "activity-1" },
    orders: [{ id: "order-1", customerUserId: "user-1", action: "already_captured" }],
  }, []);

  assert.match(notification.body, /你參加的團購/);
});

test("buildGroupBuyQualifiedNotification excludes a customer whose capture terminally failed", () => {
  // A qualified settlement can still have individual orders whose capture retries exhausted --
  // those land in `results` with status "failed" (not the separate `failures` array, which would
  // have aborted the whole settlement before reaching this point). That customer was never
  // actually charged and must not be told "團購成團囉，請留意取貨通知".
  const plan = {
    activity: { id: "activity-1", title: "手搖飲團購" },
    orders: [
      { id: "order-1", customerUserId: "user-paid-earlier", action: "already_captured" },
      { id: "order-2", customerUserId: "user-captured-now", action: "capture" },
      { id: "order-3", customerUserId: "user-capture-failed", action: "capture" },
    ],
  };
  const results = [
    { orderId: "order-1", action: "already_captured", status: "skipped" },
    { orderId: "order-2", action: "capture", status: "captured" },
    { orderId: "order-3", action: "capture", status: "failed", reason: "capture_retry_exhausted" },
  ];

  const notification = buildGroupBuyQualifiedNotification(plan, results);

  assert.deepEqual(notification.userIds, ["user-paid-earlier", "user-captured-now"]);
});

test("settleGroupBuyActivity notifies every distinct customer when the activity qualifies", async (t) => {
  const fetchCalls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, status: 200 };
  });

  const plan = {
    activity: { id: "activity-1", title: "手搖飲團購" },
    outcome: "qualified",
    orders: [
      { id: "order-1", customerUserId: "user-1", action: "already_captured", actionReason: "already_captured" },
      { id: "order-2", customerUserId: "user-2", action: "already_captured", actionReason: "already_captured" },
    ],
  };
  const settlementRepository = {
    kind: "postgres",
    withOperationLock: (lockInput, operation) => operation(),
    createPlan: async () => plan,
    completeSettlement: async () => (
      { settlement: { id: "settlement-1" }, activity: { ...plan.activity, status: "ordering" } }
    ),
  };

  const result = await settleGroupBuyActivity({
    activityId: "activity-1",
    settlementRepository,
    pushTokenRepository: {
      getPushTokensForUsers: async (userIds) => {
        assert.deepEqual(userIds, ["user-1", "user-2"]);
        return ["token-a", "token-b"];
      },
    },
  });
  await flushMicrotasks();

  assert.equal(result.error, undefined);
  assert.equal(fetchCalls.length, 1);
  const messages = JSON.parse(fetchCalls[0].options.body);
  assert.deepEqual(messages.map((message) => message.to), ["token-a", "token-b"]);
  assert.match(messages[0].body, /手搖飲團購/);
});

test("settleGroupBuyActivity does not notify a customer whose order's capture terminally failed", async (t) => {
  const fetchCalls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, status: 200 };
  });

  const plan = {
    activity: { id: "activity-1", title: "手搖飲團購" },
    outcome: "qualified",
    orders: [
      { id: "order-1", customerUserId: "user-paid", action: "already_captured", actionReason: "already_captured" },
      { id: "order-2", customerUserId: "user-declined", action: "capture", actionReason: "deadline_settlement_capture" },
    ],
  };
  const settlementRepository = {
    kind: "postgres",
    withOperationLock: (lockInput, operation) => operation(),
    createPlan: async () => plan,
    // order-2's capture is exhausted (non-retryable) -- lands in `results` with status "failed",
    // not in the separate `failures` array, so settlement still completes and would otherwise
    // notify this customer too.
    getCaptureRetryState: async () => ({ exhausted: true, attemptCount: 3, maxAttempts: 3 }),
    // completeSettlement doesn't know per-order outcomes -- the important thing here is that
    // settleGroupBuyActivityUnlocked's own `results` array (built from each order's actual
    // capture attempt) is what buildGroupBuyQualifiedNotification is filtered against, not `plan`.
    completeSettlement: async () => (
      { settlement: { id: "settlement-1" }, activity: { ...plan.activity, status: "ordering" } }
    ),
  };
  const paymentCaptureRepository = {
    recordCaptureFailure: async () => ({ attemptCount: 3, maxAttempts: 3 }),
  };

  const result = await settleGroupBuyActivity({
    activityId: "activity-1",
    settlementRepository,
    paymentCaptureRepository,
    pushTokenRepository: {
      getPushTokensForUsers: async (userIds) => {
        assert.deepEqual(userIds, ["user-paid"]);
        return ["token-a"];
      },
    },
  });
  await flushMicrotasks();

  assert.equal(result.error, undefined);
  assert.equal(fetchCalls.length, 1);
  const messages = JSON.parse(fetchCalls[0].options.body);
  assert.deepEqual(messages.map((message) => message.to), ["token-a"]);
});

test("settleGroupBuyActivity does not notify when a retried job finds the settlement already completed", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  const plan = {
    activity: { id: "activity-1", title: "手搖飲團購" },
    outcome: "qualified",
    orders: [
      { id: "order-1", customerUserId: "user-1", action: "already_captured", actionReason: "already_captured" },
    ],
  };
  const settlementRepository = {
    kind: "postgres",
    withOperationLock: (lockInput, operation) => operation(),
    createPlan: async () => plan,
    completeSettlement: async () => ({ settlement: { id: "settlement-1" }, alreadyCompleted: true }),
  };

  await settleGroupBuyActivity({
    activityId: "activity-1",
    settlementRepository,
    pushTokenRepository: { getPushTokensForUsers: async () => ["token-a"] },
  });
  await flushMicrotasks();

  assert.equal(fetchMock.mock.callCount(), 0);
});

test("settleGroupBuyActivity does not notify when the activity failed to reach its threshold", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  const plan = {
    activity: { id: "activity-1", title: "手搖飲團購" },
    outcome: "failed",
    orders: [
      { id: "order-1", customerUserId: "user-1", action: "already_captured", actionReason: "already_captured" },
    ],
  };
  const settlementRepository = {
    kind: "postgres",
    withOperationLock: (lockInput, operation) => operation(),
    createPlan: async () => plan,
    completeSettlement: async () => (
      { settlement: { id: "settlement-1" }, activity: { ...plan.activity, status: "failed" } }
    ),
  };

  await settleGroupBuyActivity({
    activityId: "activity-1",
    settlementRepository,
    pushTokenRepository: { getPushTokensForUsers: async () => ["token-a"] },
  });
  await flushMicrotasks();

  assert.equal(fetchMock.mock.callCount(), 0);
});
