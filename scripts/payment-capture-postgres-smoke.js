"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const {
  createPaymentCaptureRepository,
} = require("../backend/database/repositories/paymentCaptureRepository");
const { captureLinePayAuthorization } = require("../backend/payments/linePayService");

const proofId = randomUUID();
const activityId = `activity-capture-proof-${proofId}`;
const successOrderId = `order-capture-proof-success-${proofId}`;
const failureOrderId = `order-capture-proof-failure-${proofId}`;
const successAuthorizationId = `authorization-capture-proof-success-${proofId}`;
const failureAuthorizationId = `authorization-capture-proof-failure-${proofId}`;
let lockClient;
let lockTransactionOpen = false;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL payment capture smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const lockPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = createPaymentCaptureRepository({ runtime: "postgres", database });
  try {
    await createFixture(database);
    lockClient = await lockPool.connect();
    await lockClient.query("BEGIN");
    lockTransactionOpen = true;
    await lockClient.query(
      "SELECT id FROM group_buy_activities WHERE id = $1 FOR UPDATE",
      [activityId]
    );
    let captureSettled = false;
    const capturePromise = captureLinePayAuthorization({
      orderId: successOrderId,
      transactionId: `transaction-capture-proof-success-${proofId}`,
      provider: "mock_line_pay",
      amount: 70,
      finalAmount: 70,
      paymentCaptureRepository: repository,
    }).finally(() => { captureSettled = true; });
    await delay(300);
    assert.equal(captureSettled, false, "Capture did not wait for activity row lock");
    await lockClient.query("COMMIT");
    lockTransactionOpen = false;
    const captured = await capturePromise;
    assert.equal(captured.status, "captured");
    assert.equal(captured.capture.captureAmount, 70);
    assert.equal(captured.capture.releasedAmount, 5);

    const successPersistence = await database.query(`
      SELECT
        payment_auth.status AS authorization_status,
        order_record.payment_status,
        order_record.authorization_status AS order_authorization_status,
        order_record.final_amount,
        capture.status AS capture_status,
        capture.capture_amount,
        capture.released_amount,
        (SELECT COUNT(*)::integer FROM payment_provider_events
         WHERE resource_type = 'capture' AND resource_id = capture.id) AS event_count,
        (SELECT COUNT(*)::integer FROM status_history
         WHERE resource_type = 'payment_authorization' AND resource_id = payment_auth.id) AS history_count,
        (SELECT COUNT(*)::integer FROM audit_logs
         WHERE resource_type = 'payment_authorization' AND resource_id = payment_auth.id) AS audit_count
      FROM payment_authorizations payment_auth
      JOIN orders order_record ON order_record.id = payment_auth.order_id
      JOIN payment_captures capture ON capture.payment_authorization_id = payment_auth.id
      WHERE payment_auth.id = $1
    `, [successAuthorizationId]);
    assert.deepEqual(successPersistence.rows[0], {
      authorization_status: "captured",
      payment_status: "captured",
      order_authorization_status: "captured",
      final_amount: 70,
      capture_status: "captured",
      capture_amount: 70,
      released_amount: 5,
      event_count: 1,
      history_count: 1,
      audit_count: 1,
    });

    let providerError;
    try {
      await captureLinePayAuthorization({
        orderId: failureOrderId,
        transactionId: `transaction-capture-proof-failure-${proofId}`,
        provider: "line_pay",
        amount: 75,
        finalAmount: 75,
        paymentCaptureRepository: repository,
        providerCapturer: async () => {
          const error = new Error("simulated temporary provider failure");
          error.linePayPayload = { returnCode: "9000" };
          throw error;
        },
      });
    } catch (error) {
      providerError = error;
    }
    assert.equal(providerError?.captureFailure?.status, "retry_pending");
    assert.equal(providerError?.captureFailure?.attemptCount, 1);
    assert.equal(providerError?.captureFailure?.retryable, true);

    const failurePersistence = await database.query(`
      SELECT
        payment_auth.status AS authorization_status,
        order_record.payment_status,
        capture.status AS capture_status,
        capture.attempt_number,
        capture.retryable,
        capture.next_retry_at IS NOT NULL AS has_next_retry,
        (SELECT COUNT(*)::integer FROM payment_provider_events
         WHERE resource_type = 'capture' AND resource_id = capture.id) AS event_count,
        (SELECT COUNT(*)::integer FROM audit_logs
         WHERE resource_type = 'payment_authorization' AND resource_id = payment_auth.id) AS audit_count
      FROM payment_authorizations payment_auth
      JOIN orders order_record ON order_record.id = payment_auth.order_id
      JOIN payment_captures capture ON capture.payment_authorization_id = payment_auth.id
      WHERE payment_auth.id = $1
    `, [failureAuthorizationId]);
    assert.deepEqual(failurePersistence.rows[0], {
      authorization_status: "authorized",
      payment_status: "authorized",
      capture_status: "failed",
      attempt_number: 1,
      retryable: true,
      has_next_retry: true,
      event_count: 1,
      audit_count: 1,
    });
    console.log("PostgreSQL payment capture success/failure and activity lock proof passed.");
  } finally {
    if (lockTransactionOpen && lockClient) await lockClient.query("ROLLBACK");
    if (lockClient) lockClient.release();
    await cleanup(database);
    await lockPool.end();
    await database.close();
  }
}

async function createFixture(database) {
  const [merchantResult, customersResult] = await Promise.all([
    database.query(`
      SELECT user_id FROM merchant_users
      WHERE store_id = 'store-001' AND status = 'active'
      LIMIT 1
    `),
    database.query(`
      SELECT user_account.id
      FROM users user_account
      JOIN user_roles user_role ON user_role.user_id = user_account.id
      WHERE user_role.role = 'customer'
        AND user_role.status = 'active'
        AND user_account.status = 'active'
      ORDER BY user_account.id
      LIMIT 2
    `),
  ]);
  assert.equal(customersResult.rows.length, 2, "Two active PostgreSQL customers are required");
  const now = new Date();
  const deadline = new Date(now.getTime() + 60 * 60_000);
  const pickupStart = new Date(deadline.getTime() + 30 * 60_000);
  const pickupEnd = new Date(pickupStart.getTime() + 60 * 60_000);
  await database.transaction(async (transaction) => {
    await transaction.query(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status,
        start_at, deadline_at, pickup_start_at, pickup_end_at,
        maximum_cups, withdrawal_lock_minutes, created_at, updated_at
      ) VALUES ($1, 'store-001', $2, 'PostgreSQL Capture Proof', 'confirmed',
                $3, $4, $5, $6, 2, 30, $3, $3)
    `, [activityId, merchantResult.rows[0].user_id, now.toISOString(), deadline.toISOString(),
      pickupStart.toISOString(), pickupEnd.toISOString()]);
    for (const [index, orderId] of [successOrderId, failureOrderId].entries()) {
      await transaction.query(`
        INSERT INTO orders (
          id, activity_id, customer_user_id, status, fallback_purchase_preference,
          total_cups, original_amount, final_amount, payment_status,
          authorization_status, merchant_acceptance_status, pickup_status,
          submitted_at, updated_at
        ) VALUES ($1, $2, $3, 'submitted', 'decline_original_price',
                  1, 75, NULL, 'authorized', 'authorized', 'accepted', 'not_ready', $4, $4)
      `, [orderId, activityId, customersResult.rows[index].id, now.toISOString()]);
    }
    await transaction.query(`
      INSERT INTO payment_authorizations (
        id, order_id, provider, payment_flow, status,
        original_amount, authorized_amount, provider_authorization_id,
        authorized_at, created_at, updated_at
      ) VALUES
        ($1, $2, 'mock_line_pay', 'authorization', 'authorized', 75, 75, $3, $4, $4, $4),
        ($5, $6, 'line_pay', 'authorization', 'authorized', 75, 75, $7, $4, $4, $4)
    `, [
      successAuthorizationId,
      successOrderId,
      `transaction-capture-proof-success-${proofId}`,
      now.toISOString(),
      failureAuthorizationId,
      failureOrderId,
      `transaction-capture-proof-failure-${proofId}`,
    ]);
  });
}

async function cleanup(database) {
  const authorizationIds = [successAuthorizationId, failureAuthorizationId];
  const orderIds = [successOrderId, failureOrderId];
  const captureResult = await database.query(
    "SELECT id FROM payment_captures WHERE payment_authorization_id = ANY($1::text[])",
    [authorizationIds]
  );
  const captureIds = captureResult.rows.map((row) => row.id);
  await database.transaction(async (transaction) => {
    if (captureIds.length > 0) {
      await transaction.query(
        "DELETE FROM payment_provider_events WHERE resource_type = 'capture' AND resource_id = ANY($1::text[])",
        [captureIds]
      );
    }
    await transaction.query(
      "DELETE FROM status_history WHERE resource_type = 'payment_authorization' AND resource_id = ANY($1::text[])",
      [authorizationIds]
    );
    await transaction.query(
      "DELETE FROM audit_logs WHERE resource_type = 'payment_authorization' AND resource_id = ANY($1::text[])",
      [authorizationIds]
    );
    await transaction.query(
      "DELETE FROM payment_captures WHERE payment_authorization_id = ANY($1::text[])",
      [authorizationIds]
    );
    await transaction.query(
      "DELETE FROM payment_authorizations WHERE id = ANY($1::text[])",
      [authorizationIds]
    );
    await transaction.query("DELETE FROM orders WHERE id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM group_buy_activities WHERE id = $1", [activityId]);
  });
  const residue = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM group_buy_activities WHERE id = $1) AS activity_count,
      (SELECT COUNT(*)::integer FROM orders WHERE id = ANY($2::text[])) AS order_count,
      (SELECT COUNT(*)::integer FROM payment_authorizations WHERE id = ANY($3::text[])) AS authorization_count,
      (SELECT COUNT(*)::integer FROM operation_locks
       WHERE lock_key LIKE '%' || $4 || '%') AS lock_count
  `, [activityId, orderIds, authorizationIds, proofId]);
  assert.deepEqual(residue.rows[0], {
    activity_count: 0,
    order_count: 0,
    authorization_count: 0,
    lock_count: 0,
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
