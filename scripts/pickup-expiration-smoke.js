const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { runDuePickupExpirations } = require("../backend/pickup/expirationService");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const backupPath = path.join(
  os.tmpdir(),
  `drink-group-buy-pickup-smoke-${process.pid}-${Date.now()}.sqlite`
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

function resetDatabaseForSmoke() {
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

function insertUser(database, id, role, now) {
  database.prepare(`
    INSERT INTO users (
      id, login_name, email, display_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(id, `${id}-login`, `${id}@example.test`, id, now, now);
  database.prepare(`
    INSERT INTO user_roles (id, user_id, role, status, granted_at)
    VALUES (?, ?, ?, 'active', ?)
  `).run(`role-${id}-${role}`, id, role, now);
}

function insertActivity(database, input, merchantUserId, storeId, now) {
  database.prepare(`
    INSERT INTO group_buy_activities (
      id, store_id, created_by_user_id, title, status,
      start_at, deadline_at, pickup_start_at, pickup_end_at,
      maximum_cups, withdrawal_lock_minutes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 20, 30, ?, ?)
  `).run(
    input.id,
    storeId,
    merchantUserId,
    input.id,
    input.status,
    input.startAt,
    input.deadlineAt,
    input.pickupStartAt,
    input.pickupEndAt,
    now,
    now
  );
}

function insertOrder(database, input, now) {
  database.prepare(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status,
      fallback_purchase_preference, total_cups, original_amount, final_amount,
      payment_status, authorization_status, merchant_acceptance_status,
      pickup_status, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, 'decline_original_price', 1, 65, 65, ?, ?, 'accepted', ?, ?, ?)
  `).run(
    input.id,
    input.activityId,
    input.customerUserId,
    input.status,
    input.paymentStatus,
    input.paymentStatus === "captured" ? "captured" : "failed",
    input.pickupStatus,
    now,
    now
  );

  if (input.expiresAt) {
    database.prepare(`
      INSERT INTO pickup_credentials (
        id, order_id, pickup_code, visible_after_merchant_acceptance,
        expires_at, expired_at, created_at
      ) VALUES (?, ?, ?, 1, ?, NULL, ?)
    `).run(`credential-${input.id}`, input.id, `CODE-${input.id}`, input.expiresAt, now);
  }
}

function seedSmokeData(now) {
  withDatabase((database) => {
    const merchantUserId = "pickup-smoke-merchant-user";
    const merchantId = "pickup-smoke-merchant";
    const storeId = "pickup-smoke-store";
    const customers = [
      "pickup-smoke-customer-expired",
      "pickup-smoke-customer-picked",
      "pickup-smoke-customer-failed",
      "pickup-smoke-customer-future"
    ];

    database.exec("BEGIN;");
    try {
      insertUser(database, merchantUserId, "merchant", now);
      customers.forEach((id) => insertUser(database, id, "customer", now));
      database.prepare(`
        INSERT INTO merchants (id, name, status, created_at, updated_at)
        VALUES (?, 'Pickup Smoke Merchant', 'active', ?, ?)
      `).run(merchantId, now, now);
      database.prepare(`
        INSERT INTO merchant_users (
          id, merchant_id, user_id, permission_level, status, created_at
        ) VALUES (?, ?, ?, 'owner', 'active', ?)
      `).run("pickup-smoke-merchant-link", merchantId, merchantUserId, now);
      database.prepare(`
        INSERT INTO stores (
          id, merchant_id, name, address, business_status,
          latitude, longitude, created_at, updated_at
        ) VALUES (?, ?, 'Pickup Smoke Store', 'Test Address', 'open', 24.0, 120.0, ?, ?)
      `).run(storeId, merchantId, now, now);

      insertActivity(database, {
        id: "pickup-smoke-due",
        status: "ready_for_pickup",
        startAt: "2026-07-29T06:00:00.000Z",
        deadlineAt: "2026-07-29T07:00:00.000Z",
        pickupStartAt: "2026-07-29T08:00:00.000Z",
        pickupEndAt: "2026-07-29T14:00:00.000Z"
      }, merchantUserId, storeId, now);
      insertActivity(database, {
        id: "pickup-smoke-future",
        status: "ready_for_pickup",
        startAt: "2026-07-29T09:00:00.000Z",
        deadlineAt: "2026-07-29T10:00:00.000Z",
        pickupStartAt: "2026-07-29T11:30:00.000Z",
        pickupEndAt: "2026-07-29T15:00:00.000Z"
      }, merchantUserId, storeId, now);

      insertOrder(database, {
        id: "pickup-smoke-order-expired",
        activityId: "pickup-smoke-due",
        customerUserId: customers[0],
        status: "locked",
        paymentStatus: "captured",
        pickupStatus: "ready",
        expiresAt: "2026-07-29T11:00:00.000Z"
      }, now);
      insertOrder(database, {
        id: "pickup-smoke-order-picked",
        activityId: "pickup-smoke-due",
        customerUserId: customers[1],
        status: "locked",
        paymentStatus: "captured",
        pickupStatus: "picked_up",
        expiresAt: "2026-07-29T11:00:00.000Z"
      }, now);
      insertOrder(database, {
        id: "pickup-smoke-order-failed",
        activityId: "pickup-smoke-due",
        customerUserId: customers[2],
        status: "locked",
        paymentStatus: "failed",
        pickupStatus: "not_ready"
      }, now);
      insertOrder(database, {
        id: "pickup-smoke-order-future",
        activityId: "pickup-smoke-future",
        customerUserId: customers[3],
        status: "locked",
        paymentStatus: "captured",
        pickupStatus: "ready",
        expiresAt: "2026-07-29T14:30:00.000Z"
      }, now);

      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  });
}

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Development database not found: ${databasePath}`);
  }

  fs.copyFileSync(databasePath, backupPath);
  const now = "2026-07-29T12:00:00.000Z";

  try {
    resetDatabaseForSmoke();
    seedSmokeData(now);
    const firstRun = await runDuePickupExpirations({ now, limit: 10 });
    assert(firstRun.dueActivityCount === 1, "only one activity should be due", firstRun);
    assert(firstRun.expiredActivityCount === 1, "due activity should be completed", firstRun);

    const state = withDatabase((database) => ({
      dueActivity: database.prepare("SELECT status FROM group_buy_activities WHERE id = 'pickup-smoke-due'").get(),
      futureActivity: database.prepare("SELECT status FROM group_buy_activities WHERE id = 'pickup-smoke-future'").get(),
      expiredOrder: database.prepare("SELECT status, pickup_status FROM orders WHERE id = 'pickup-smoke-order-expired'").get(),
      pickedOrder: database.prepare("SELECT status, pickup_status FROM orders WHERE id = 'pickup-smoke-order-picked'").get(),
      failedOrder: database.prepare("SELECT status, pickup_status FROM orders WHERE id = 'pickup-smoke-order-failed'").get(),
      expiredCredential: database.prepare("SELECT expired_at FROM pickup_credentials WHERE order_id = 'pickup-smoke-order-expired'").get(),
      pickupHistoryCount: database.prepare("SELECT COUNT(*) AS count FROM status_history WHERE resource_type = 'pickup' AND reason = 'pickup_window_expired'").get().count,
      activityHistoryCount: database.prepare("SELECT COUNT(*) AS count FROM status_history WHERE resource_type = 'activity' AND reason = 'pickup_window_expired'").get().count,
      auditCount: database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action_type = 'system_expire_pickup_window'").get().count
    }));

    assert(state.dueActivity.status === "completed", "due activity should move to completed", state);
    assert(state.futureActivity.status === "ready_for_pickup", "future activity must stay active", state);
    assert(state.expiredOrder.status === "completed" && state.expiredOrder.pickup_status === "expired", "uncollected paid order should expire", state);
    assert(state.pickedOrder.status === "completed" && state.pickedOrder.pickup_status === "picked_up", "picked-up order should stay picked up", state);
    assert(state.failedOrder.status === "locked" && state.failedOrder.pickup_status === "not_ready", "failed payment must not be marked expired", state);
    assert(Boolean(state.expiredCredential.expired_at), "expired credential should record expired_at", state);
    assert(state.pickupHistoryCount === 1 && state.activityHistoryCount === 1 && state.auditCount === 1, "history and audit should be written once", state);

    const secondRun = await runDuePickupExpirations({ now, limit: 10 });
    assert(secondRun.dueActivityCount === 0, "completed activity must not be processed twice", secondRun);

    const integrity = withDatabase((database) => ({
      integrity: database.prepare("PRAGMA integrity_check").get().integrity_check,
      foreignKeyErrors: database.prepare("PRAGMA foreign_key_check").all().length
    }));
    assert(integrity.integrity === "ok" && integrity.foreignKeyErrors === 0, "database integrity should remain valid", integrity);

    console.log("Pickup expiration smoke passed");
    console.log("due activity: completed=1, expired_orders=1, picked_up_preserved=1");
    console.log("future activity: unchanged=1");
    console.log("idempotency: duplicate_history=0, duplicate_audit=0");
  } finally {
    fs.copyFileSync(backupPath, databasePath);
    fs.rmSync(backupPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
});
