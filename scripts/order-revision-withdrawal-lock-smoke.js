"use strict";

// Verifies the 2026-09-13 withdrawal-lock rule change against a real PostgreSQL dev database:
//   1. An authorized order CAN be topped up (increased) inside the withdrawal-lock window.
//   2. An authorized order CANNOT be decreased inside the withdrawal-lock window.
//   3. Neither increase nor decrease is allowed once the activity's real deadline has passed,
//      even if the settlement scheduler hasn't yet flipped the activity's status.
//   4. A pending (never-authorized) order has no withdrawal-lock at all -- it can still be
//      decreased right up to the real deadline.
//
// Creates isolated throwaway activities/orders (reusing existing active customer accounts) and
// cleans them up afterward, following the same pattern as order-revision-postgres-smoke.js.

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const { createOrderRevisionRepository } = require("../backend/database/repositories/orderRevisionRepository");
const { updatePostgresPendingOrder } = require("../backend/database/repositories/customerOrderWriteRepository");

const proofId = randomUUID();
const activityIdIncrease = `activity-lock-increase-${proofId}`;
const activityIdDecrease = `activity-lock-decrease-${proofId}`;
const activityIdPastDeadline = `activity-lock-past-deadline-${proofId}`;
const activityIdPending = `activity-lock-pending-${proofId}`;
const orderIdIncrease = `order-lock-increase-${proofId}`;
const orderIdDecrease = `order-lock-decrease-${proofId}`;
const orderIdPastDeadline = `order-lock-past-deadline-${proofId}`;
const orderIdPending = `order-lock-pending-${proofId}`;

const DRINK_ITEM = {
  menuItemId: "drink-001",
  quantity: 2,
  customizationOptionIds: [
    "drink-001-opt-size-medium",
    "drink-001-opt-sweet-regular",
    "drink-001-opt-ice-regular",
  ],
};

function items(quantity) {
  return [{ ...DRINK_ITEM, quantity }];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL order revision withdrawal-lock smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const orderRevisionRepository = createOrderRevisionRepository({ runtime: "postgres", database });

  try {
    const fixture = await createFixture(database);

    // --- Scenario 1: increase inside the withdrawal-lock window must succeed. ---
    const increaseResult = await orderRevisionRepository.createRevision({
      orderId: orderIdIncrease,
      customerUserId: fixture.customerIncrease,
      items: items(3),
    });
    assert.ok(increaseResult.revision, `increase inside lock window should succeed, got: ${JSON.stringify(increaseResult)}`);
    assert.equal(increaseResult.revision.totalCups, 3);
    console.log("[1/4] increase inside withdrawal-lock window: PASS (revision created)");

    // --- Scenario 2: decrease inside the withdrawal-lock window must be rejected. ---
    const decreaseResult = await orderRevisionRepository.createRevision({
      orderId: orderIdDecrease,
      customerUserId: fixture.customerDecrease,
      items: items(1),
    });
    assert.equal(decreaseResult.error, "order_locked_by_deadline", `decrease inside lock window should be rejected, got: ${JSON.stringify(decreaseResult)}`);
    console.log("[2/4] decrease inside withdrawal-lock window: PASS (rejected with order_locked_by_deadline)");

    // --- Scenario 3: any revision (even an increase) after the real deadline must be rejected. ---
    const pastDeadlineResult = await orderRevisionRepository.createRevision({
      orderId: orderIdPastDeadline,
      customerUserId: fixture.customerPastDeadline,
      items: items(3),
    });
    assert.equal(pastDeadlineResult.error, "order_locked_by_deadline", `increase after the real deadline should be rejected, got: ${JSON.stringify(pastDeadlineResult)}`);
    console.log("[3/4] increase after the real deadline (activity status not yet flipped): PASS (rejected with order_locked_by_deadline)");

    // --- Scenario 4: a pending (never-authorized) order has no withdrawal-lock at all. ---
    const pendingResult = await updatePostgresPendingOrder(database, {
      orderId: orderIdPending,
      customerUserId: fixture.customerPending,
      items: items(1),
    });
    assert.equal(pendingResult.error, undefined, `pending-order decrease inside lock window should succeed, got: ${JSON.stringify(pendingResult)}`);
    assert.equal(pendingResult.order.totalCups, 1);
    console.log("[4/4] pending-order decrease inside withdrawal-lock window: PASS (no lock applies)");

    console.log("PostgreSQL order revision withdrawal-lock proof passed.");
  } finally {
    await cleanup(database);
    await database.close();
  }
}

async function createFixture(database) {
  const customersResult = await database.query(`
    SELECT user_account.id
    FROM users user_account
    JOIN user_roles user_role ON user_role.user_id = user_account.id
    WHERE user_role.role = 'customer'
      AND user_role.status = 'active'
      AND user_account.status = 'active'
    ORDER BY user_account.id
    LIMIT 4
  `);
  assert.equal(customersResult.rows.length, 4, "Four active PostgreSQL customers are required");
  const [customerIncrease, customerDecrease, customerPastDeadline, customerPending] = customersResult.rows.map((row) => row.id);
  const merchantResult = await database.query(`
    SELECT user_id FROM merchant_users WHERE store_id = 'store-001' AND status = 'active'
  `);
  const merchantUserId = merchantResult.rows[0].user_id;

  const now = new Date();
  const start = new Date(now.getTime() - 90 * 60_000).toISOString();
  const pickupStart = new Date(now.getTime() + 7 * 60 * 60_000).toISOString();
  const pickupEnd = new Date(now.getTime() + 10 * 60 * 60_000).toISOString();
  // 10 minutes from now: inside the default 30-minute withdrawal-lock window, but not past it yet.
  const deadlineInsideLock = new Date(now.getTime() + 10 * 60_000).toISOString();
  // 1 minute in the past: the real deadline has already passed. The activity's own `status` is left
  // as 'recruiting' on purpose (as if the settlement scheduler hasn't run yet) to reproduce exactly
  // the race window the fix closes -- activity_status alone must not be relied on to block this.
  const deadlinePast = new Date(now.getTime() - 60_000).toISOString();

  await database.transaction(async (transaction) => {
    for (const [activityId, deadline] of [
      [activityIdIncrease, deadlineInsideLock],
      [activityIdDecrease, deadlineInsideLock],
      [activityIdPastDeadline, deadlinePast],
      [activityIdPending, deadlineInsideLock],
    ]) {
      await transaction.query(`
        INSERT INTO group_buy_activities (
          id, store_id, created_by_user_id, title, status,
          start_at, deadline_at, pickup_start_at, pickup_end_at,
          maximum_cups, withdrawal_lock_minutes, created_at, updated_at
        ) VALUES ($1, 'store-001', $2, 'PostgreSQL Withdrawal-Lock Proof', 'recruiting',
                  $3, $4, $5, $6, 10, 30, $4, $4)
      `, [activityId, merchantUserId, start, deadline, pickupStart, pickupEnd]);
    }

    await insertAuthorizedOrder(transaction, {
      orderId: orderIdIncrease, activityId: activityIdIncrease, customerUserId: customerIncrease,
      totalCups: 2, amount: 130, authorizationId: `payment-authorization-lock-increase-${proofId}`,
    });
    await insertAuthorizedOrder(transaction, {
      orderId: orderIdDecrease, activityId: activityIdDecrease, customerUserId: customerDecrease,
      totalCups: 2, amount: 130, authorizationId: `payment-authorization-lock-decrease-${proofId}`,
    });
    await insertAuthorizedOrder(transaction, {
      orderId: orderIdPastDeadline, activityId: activityIdPastDeadline, customerUserId: customerPastDeadline,
      totalCups: 2, amount: 130, authorizationId: `payment-authorization-lock-past-deadline-${proofId}`,
    });
    await insertPendingOrder(transaction, {
      orderId: orderIdPending, activityId: activityIdPending, customerUserId: customerPending,
      totalCups: 2, amount: 130,
    });
  });

  return { customerIncrease, customerDecrease, customerPastDeadline, customerPending };
}

async function insertAuthorizedOrder(database, { orderId, activityId, customerUserId, totalCups, amount, authorizationId }) {
  const now = new Date().toISOString();
  await database.query(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status, fallback_purchase_preference,
      total_cups, original_amount, payment_status, authorization_status,
      merchant_acceptance_status, pickup_status, submitted_at, updated_at
    ) VALUES ($1, $2, $3, 'submitted', 'decline_original_price', $4, $5, 'authorized', 'authorized', 'accepted', 'not_ready', $6, $6)
  `, [orderId, activityId, customerUserId, totalCups, amount, now]);
  await database.query(`
    INSERT INTO payment_authorizations (
      id, order_id, provider, payment_flow, status, original_amount, authorized_amount,
      provider_authorization_id, authorized_at, created_at, updated_at
    ) VALUES ($1, $2, 'mock_line_pay', 'authorization', 'authorized', $3, $3, $4, $5, $5, $5)
  `, [authorizationId, orderId, amount, `mock-original-txn-${orderId}`, now]);
}

async function insertPendingOrder(database, { orderId, activityId, customerUserId, totalCups, amount }) {
  const now = new Date().toISOString();
  await database.query(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status, fallback_purchase_preference,
      total_cups, original_amount, payment_status, authorization_status,
      merchant_acceptance_status, pickup_status, submitted_at, updated_at
    ) VALUES ($1, $2, $3, 'submitted', 'decline_original_price', $4, $5, 'pending', 'pending', 'accepted', 'not_ready', $6, $6)
  `, [orderId, activityId, customerUserId, totalCups, amount, now]);
}

async function cleanup(database) {
  const activityIds = [activityIdIncrease, activityIdDecrease, activityIdPastDeadline, activityIdPending];
  const orderIds = [orderIdIncrease, orderIdDecrease, orderIdPastDeadline, orderIdPending];
  await database.transaction(async (transaction) => {
    await transaction.query(
      "DELETE FROM order_revision_item_customizations WHERE order_revision_item_id IN ("
      + "SELECT id FROM order_revision_items WHERE order_revision_id IN ("
      + "SELECT id FROM order_revisions WHERE order_id = ANY($1::text[])))",
      [orderIds]
    );
    await transaction.query(
      "DELETE FROM order_revision_items WHERE order_revision_id IN ("
      + "SELECT id FROM order_revisions WHERE order_id = ANY($1::text[]))",
      [orderIds]
    );
    await transaction.query(
      "DELETE FROM order_item_customizations WHERE order_item_id IN ("
      + "SELECT id FROM order_items WHERE order_id = ANY($1::text[]))",
      [orderIds]
    );
    await transaction.query("DELETE FROM order_items WHERE order_id = ANY($1::text[])", [orderIds]);
    await transaction.query(
      "DELETE FROM audit_logs WHERE (resource_type = 'order' AND resource_id = ANY($1::text[])) "
      + "OR (resource_type = 'payment_authorization' AND resource_id IN "
      + "(SELECT id FROM payment_authorizations WHERE order_id = ANY($1::text[])))",
      [orderIds]
    );
    await transaction.query(
      "DELETE FROM status_history WHERE (resource_type = 'order' AND resource_id = ANY($1::text[])) "
      + "OR (resource_type = 'payment_authorization' AND resource_id IN "
      + "(SELECT id FROM payment_authorizations WHERE order_id = ANY($1::text[])))",
      [orderIds]
    );
    await transaction.query(
      "UPDATE order_revisions SET original_payment_authorization_id = NULL, "
      + "replacement_payment_authorization_id = NULL WHERE order_id = ANY($1::text[])",
      [orderIds]
    );
    await transaction.query("DELETE FROM payment_authorizations WHERE order_id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM order_revisions WHERE order_id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM orders WHERE id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM group_buy_activities WHERE id = ANY($1::text[])", [activityIds]);
  });
  const residue = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM group_buy_activities WHERE id = ANY($1::text[])) AS activity_count,
      (SELECT COUNT(*)::integer FROM orders WHERE id = ANY($2::text[])) AS order_count,
      (SELECT COUNT(*)::integer FROM order_revisions WHERE order_id = ANY($2::text[])) AS revision_count,
      (SELECT COUNT(*)::integer FROM payment_authorizations WHERE order_id = ANY($2::text[])) AS authorization_count,
      (SELECT COUNT(*)::integer FROM audit_logs WHERE resource_type = 'order' AND resource_id = ANY($2::text[])) AS order_audit_count
  `, [activityIds, orderIds]);
  assert.deepEqual(residue.rows[0], {
    activity_count: 0,
    order_count: 0,
    revision_count: 0,
    authorization_count: 0,
    order_audit_count: 0,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
