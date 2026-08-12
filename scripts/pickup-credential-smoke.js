const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  getPickupCredentialForOrder,
  lookupPickupCode,
  markGroupBuyActivityReadyForPickup,
  redeemPickupCode
} = require("../backend/pickup/credentialService");
const {
  acquireOperationLock,
  releaseOperationLock
} = require("../backend/db");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const backupPath = path.join(
  os.tmpdir(),
  "drink-group-buy-pickup-code-smoke-" + process.pid + "-" + Date.now() + ".sqlite"
);

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function withDatabase(callback) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  try {
    return callback(database);
  } finally {
    database.close();
  }
}

function resetDatabase() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  fs.rmSync(databasePath, { force: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(schema);
  } finally {
    database.close();
  }
}

function seedDatabase(now) {
  withDatabase((database) => {
    const insertUser = database.prepare(`
      INSERT INTO users (id, login_name, email, display_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `);
    const insertRole = database.prepare(`
      INSERT INTO user_roles (id, user_id, role, status, granted_at)
      VALUES (?, ?, ?, 'active', ?)
    `);

    for (const user of [
      ["pickup-merchant-user", "pickup-merchant", "merchant@example.test", "Pickup Merchant", "merchant"],
      ["other-merchant-user", "other-merchant", "other@example.test", "Other Merchant", "merchant"],
      ["pickup-customer-a", "pickup-customer-a", "a@example.test", "Customer A", "customer"],
      ["pickup-customer-b", "pickup-customer-b", "b@example.test", "Customer B", "customer"],
      ["pickup-customer-failed", "pickup-customer-failed", "failed@example.test", "Failed Customer", "customer"]
    ]) {
      insertUser.run(user[0], user[1], user[2], user[3], now, now);
      insertRole.run("role-" + user[0], user[0], user[4], now);
    }

    database.prepare(`
      INSERT INTO merchants (id, name, status, created_at, updated_at)
      VALUES ('pickup-merchant', 'Pickup Merchant', 'active', ?, ?),
             ('other-merchant', 'Other Merchant', 'active', ?, ?)
    `).run(now, now, now, now);
    database.prepare(`
      INSERT INTO merchant_users
        (id, merchant_id, user_id, permission_level, status, created_at)
      VALUES ('pickup-merchant-link', 'pickup-merchant', 'pickup-merchant-user', 'owner', 'active', ?),
             ('other-merchant-link', 'other-merchant', 'other-merchant-user', 'owner', 'active', ?)
    `).run(now, now);
    database.prepare(`
      INSERT INTO stores
        (id, merchant_id, name, address, latitude, longitude, created_at, updated_at)
      VALUES ('pickup-store', 'pickup-merchant', 'Pickup Store', 'Test Address', 24.0, 120.0, ?, ?),
             ('other-store', 'other-merchant', 'Other Store', 'Other Address', 24.1, 120.1, ?, ?)
    `).run(now, now, now, now);

    database.prepare(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status, start_at, deadline_at,
        pickup_start_at, pickup_end_at, maximum_cups, withdrawal_lock_minutes, created_at, updated_at
      ) VALUES (?, 'pickup-store', 'pickup-merchant-user', 'Pickup Smoke', 'ordering',
        ?, ?, ?, ?, 20, 30, ?, ?)
    `).run(
      "pickup-code-activity",
      "2026-07-29T08:00:00.000Z",
      "2026-07-29T09:00:00.000Z",
      "2026-07-29T11:00:00.000Z",
      "2026-07-29T14:00:00.000Z",
      now,
      now
    );

    const insertOrder = database.prepare(`
      INSERT INTO orders (
        id, activity_id, customer_user_id, status, fallback_purchase_preference,
        total_cups, original_amount, final_amount, payment_status, authorization_status,
        merchant_acceptance_status, pickup_status, submitted_at, updated_at
      ) VALUES (?, 'pickup-code-activity', ?, 'locked', 'accept_original_price',
        ?, ?, ?, ?, ?, 'accepted', 'not_ready', ?, ?)
    `);
    insertOrder.run(
      "pickup-code-order-a",
      "pickup-customer-a",
      2,
      120,
      100,
      "captured",
      "captured",
      now,
      now
    );
    insertOrder.run(
      "pickup-code-order-b",
      "pickup-customer-b",
      1,
      60,
      50,
      "captured",
      "captured",
      now,
      now
    );
    insertOrder.run(
      "pickup-code-order-failed",
      "pickup-customer-failed",
      1,
      60,
      null,
      "failed",
      "failed",
      now,
      now
    );
  });
}

function readState() {
  return withDatabase((database) => ({
    activity: database.prepare(
      "SELECT status FROM group_buy_activities WHERE id = 'pickup-code-activity'"
    ).get(),
    orders: database.prepare(`
      SELECT id, status, payment_status, pickup_status
      FROM orders
      WHERE activity_id = 'pickup-code-activity'
      ORDER BY id
    `).all(),
    credentials: database.prepare(`
      SELECT order_id, pickup_code, redeemed_at, redeemed_by_user_id
      FROM pickup_credentials
      ORDER BY order_id
    `).all(),
    pickupHistories: database.prepare(`
      SELECT resource_id, to_status
      FROM status_history
      WHERE resource_type = 'pickup'
      ORDER BY created_at, resource_id
    `).all(),
    auditCount: database.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_logs
      WHERE action_type IN (
        'merchant_mark_activity_ready_for_pickup',
        'merchant_redeem_pickup_code'
      )
    `).get(),
    integrity: database.prepare("PRAGMA integrity_check").get(),
    foreignKeys: database.prepare("PRAGMA foreign_key_check").all()
  }));
}

const hadDatabase = fs.existsSync(databasePath);
if (hadDatabase) fs.copyFileSync(databasePath, backupPath);

const now = "2026-07-29T10:00:00.000Z";

(async () => {
try {
  resetDatabase();
  seedDatabase(now);

  const readyLockKey = "pickup:activity:pickup-code-activity:transition";
  const readyLock = acquireOperationLock({
    lockKey: readyLockKey,
    ownerId: "pickup-ready-blocker",
    now
  });
  const blockedReady = await markGroupBuyActivityReadyForPickup("pickup-code-activity", {
    actorUserId: "pickup-merchant-user",
    now
  });
  assert(blockedReady.error === "operation_locked", "activity lease should block ready transition", blockedReady);
  releaseOperationLock({ lockKey: readyLockKey, ownerId: readyLock.ownerId });

  const ready = await markGroupBuyActivityReadyForPickup("pickup-code-activity", {
    actorUserId: "pickup-merchant-user",
    now
  });
  assert(ready.status === "ready_for_pickup", "activity should become ready", ready);
  assert(ready.createdCredentialCount === 2, "only captured orders should receive codes", ready);
  assert(ready.credentials.every((item) => /^\d{6}$/.test(item.pickupCode)), "codes must be six digits", ready);
  assert(new Set(ready.credentials.map((item) => item.pickupCode)).size === 2, "active codes must be unique", ready);

  const repeatReady = await markGroupBuyActivityReadyForPickup("pickup-code-activity", {
    actorUserId: "pickup-merchant-user",
    now
  });
  assert(repeatReady.createdCredentialCount === 0, "ready operation must be idempotent", repeatReady);
  assert(repeatReady.readyOrderCount === 0, "orders must not be marked ready twice", repeatReady);

  const customerCredential = await getPickupCredentialForOrder("pickup-code-order-a", { now });
  assert(customerCredential.status === "active", "customer code should be active", customerCredential);
  const firstCode = customerCredential.pickupCode;
  const secondCode = ready.credentials.find((item) => item.orderId === "pickup-code-order-b").pickupCode;

  const crossStore = await lookupPickupCode({
    actorUserId: "other-merchant-user",
    pickupCode: firstCode,
    now
  });
  assert(crossStore.error === "credential_not_found", "other merchant must not access code", crossStore);

  const preview = await lookupPickupCode({
    actorUserId: "pickup-merchant-user",
    pickupCode: firstCode,
    now
  });
  assert(preview.credential.status === "active", "merchant should preview active order", preview);
  assert(preview.credential.orderId === "pickup-code-order-a", "preview should match order", preview);

  const redeemLockKey = `pickup:code:${firstCode}:redeem`;
  const redeemLock = acquireOperationLock({
    lockKey: redeemLockKey,
    ownerId: "pickup-redeem-blocker",
    now
  });
  const blockedRedeem = await redeemPickupCode({
    actorUserId: "pickup-merchant-user",
    pickupCode: firstCode,
    now
  });
  assert(blockedRedeem.error === "operation_locked", "code lease should block redemption", blockedRedeem);
  releaseOperationLock({ lockKey: redeemLockKey, ownerId: redeemLock.ownerId });

  const firstRedeem = await redeemPickupCode({
    actorUserId: "pickup-merchant-user",
    pickupCode: firstCode,
    now
  });
  assert(firstRedeem.status === "redeemed", "first code should redeem", firstRedeem);
  assert(firstRedeem.activityCompleted === false, "activity should wait for remaining pickup", firstRedeem);

  const duplicateRedeem = await redeemPickupCode({
    actorUserId: "pickup-merchant-user",
    pickupCode: firstCode,
    now
  });
  assert(
    duplicateRedeem.error === "credential_already_redeemed",
    "redeemed code must not redeem twice",
    duplicateRedeem
  );

  const secondRedeem = await redeemPickupCode({
    actorUserId: "pickup-merchant-user",
    pickupCode: secondCode,
    now
  });
  assert(secondRedeem.activityCompleted === true, "all pickups should complete activity", secondRedeem);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const failed = await lookupPickupCode({
      actorUserId: "other-merchant-user",
      pickupCode: "invalid",
      now
    });
    assert(failed.error === "pickup_code_invalid", "invalid attempt should be rejected", failed);
  }
  const limited = await lookupPickupCode({
    actorUserId: "other-merchant-user",
    pickupCode: "000000",
    now
  });
  assert(limited.error === "pickup_code_rate_limited", "failed attempts should be rate limited", limited);

  const state = readState();
  assert(state.activity.status === "completed", "activity should be completed", state);
  assert(
    state.orders.filter((order) => order.payment_status === "captured")
      .every((order) => order.status === "completed" && order.pickup_status === "picked_up"),
    "captured orders should be picked up",
    state
  );
  const failedOrder = state.orders.find((order) => order.id === "pickup-code-order-failed");
  assert(failedOrder.status === "locked" && failedOrder.pickup_status === "not_ready", "failed order must remain unchanged", state);
  assert(state.credentials.length === 2, "failed payment must not receive credential", state);
  assert(state.credentials.every((item) => item.redeemed_by_user_id === "pickup-merchant-user"), "merchant redemption should be audited", state);
  assert(state.pickupHistories.filter((item) => item.to_status === "picked_up").length === 2, "pickup history should be written once", state);
  assert(Number(state.auditCount.count) === 3, "ready plus two redemptions should create three audit logs", state);
  assert(state.integrity.integrity_check === "ok", "database integrity should pass", state);
  assert(state.foreignKeys.length === 0, "foreign key check should pass", state);

  console.log("Pickup credential smoke passed");
  console.log("codes: six_digits=1, active_unique=1, failed_payment_excluded=1");
  console.log("permissions: cross_store_denied=1, proxy_code_allowed=1");
  console.log("redemption: duplicate_suppressed=1, activity_completed=1");
  console.log("locking: ready_transition_blocked=1, redeem_transition_blocked=1");
  console.log("rate_limit: failed_attempts=5, blocked=1");
} finally {
  if (hadDatabase) {
    fs.copyFileSync(backupPath, databasePath);
    fs.rmSync(backupPath, { force: true });
  } else {
    fs.rmSync(databasePath, { force: true });
  }
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
