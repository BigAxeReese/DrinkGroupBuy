"use strict";

const assert = require("node:assert/strict");
const {
  createManualLinePayRepaymentRepository,
  resolveManualLinePayRepaymentRuntime,
} = require("../backend/database/repositories/manualLinePayRepaymentRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresRepaymentContextEligible();
  await verifyPostgresRepaymentContextAlreadyPaid();
  await verifyPostgresCompleteRepaymentHappyPath();
  await verifyPostgresCompleteRepaymentAlreadyCaptured();
  await verifyPostgresCompleteRepaymentAmountMismatch();
  verifyRuntimeValidation();
  console.log("Manual LINE Pay repayment repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const expectedContext = { orderId: "order-sqlite", eligible: true };
  const expectedCompletion = { status: "captured" };
  let receivedOrderId;
  let receivedCompleteInput;
  const repository = createManualLinePayRepaymentRepository({
    env: {},
    sqliteGateway: {
      getRepaymentContext(orderId) {
        receivedOrderId = orderId;
        return expectedContext;
      },
      completeRepayment(value) {
        receivedCompleteInput = value;
        return expectedCompletion;
      },
    },
  });

  assert.equal(repository.kind, "sqlite");
  assert.equal(await repository.getRepaymentContext("order-sqlite"), expectedContext);
  assert.equal(receivedOrderId, "order-sqlite");
  const completeInput = { orderId: "order-sqlite" };
  assert.equal(await repository.completeRepayment(completeInput), expectedCompletion);
  assert.equal(receivedCompleteInput, completeInput);
  await repository.close();
}

async function verifyPostgresRepaymentContextEligible() {
  const calls = [];
  const database = createFakeContextDatabase(calls, { paymentStatus: "failed", terminalFailure: true });
  const repository = createManualLinePayRepaymentRepository({ runtime: "postgres", database });
  const context = await repository.getRepaymentContext("order-001", { now: "2026-06-25T10:00:00.000Z" });

  assert.equal(context.orderId, "order-001");
  assert.equal(context.eligible, true);
  assert.equal(context.reason, null);
  assert.equal(context.finalAmount, 248);
  assert.equal(context.originalAuthorization.provider, "line_pay");
}

async function verifyPostgresRepaymentContextAlreadyPaid() {
  const calls = [];
  const database = createFakeContextDatabase(calls, { paymentStatus: "captured", terminalFailure: true });
  const repository = createManualLinePayRepaymentRepository({ runtime: "postgres", database });
  const context = await repository.getRepaymentContext("order-001", { now: "2026-06-25T10:00:00.000Z" });

  assert.equal(context.eligible, false);
  assert.equal(context.reason, "already_paid");
}

async function verifyPostgresCompleteRepaymentHappyPath() {
  const calls = [];
  const database = createFakeCompletionDatabase(calls);
  const repository = createManualLinePayRepaymentRepository({ runtime: "postgres", database });
  const result = await repository.completeRepayment({
    orderId: "order-001",
    providerTransactionId: "linepay-txn-001",
    amount: 248,
    now: "2026-06-25T10:16:00.000Z",
  });

  assert.equal(database.transactionCount, 1);
  assert.equal(result.status, "captured");
  assert.equal(result.authorization.status, "captured");
  assert.equal(result.authorization.authorizedAmount, 248);
  assert.equal(result.capture.captureAmount, 248);
  assert.equal(result.order.id, "order-001");

  assert.ok(calls.some((call) => (
    call.sql.includes("UPDATE payment_authorizations") && call.sql.includes("RETURNING *")
  )));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO payment_captures")));
  assert.ok(calls.some((call) => (
    call.sql.includes("UPDATE orders") && call.sql.includes("payment_status = 'captured'")
  )));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE group_buy_activities")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO payment_provider_events")));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO status_history") && call.sql.includes("'payment_authorization'")
  )));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO status_history") && call.sql.includes("'activity'")
  )));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
}

async function verifyPostgresCompleteRepaymentAlreadyCaptured() {
  const calls = [];
  const database = createFakeCompletionDatabase(calls, { authorizationStatus: "captured" });
  const repository = createManualLinePayRepaymentRepository({ runtime: "postgres", database });
  const result = await repository.completeRepayment({
    orderId: "order-001",
    providerTransactionId: "linepay-txn-001",
    amount: 248,
    now: "2026-06-25T10:16:00.000Z",
  });

  assert.equal(result.status, "captured");
  assert.equal(result.authorization.status, "captured");
  assert.equal(calls.some((call) => call.sql.includes("UPDATE payment_authorizations")), false);
}

async function verifyPostgresCompleteRepaymentAmountMismatch() {
  const calls = [];
  const database = createFakeCompletionDatabase(calls);
  const repository = createManualLinePayRepaymentRepository({ runtime: "postgres", database });
  const result = await repository.completeRepayment({
    orderId: "order-001",
    providerTransactionId: "linepay-txn-001",
    amount: 999,
    now: "2026-06-25T10:16:00.000Z",
  });

  assert.equal(result.error, "repayment_amount_mismatch");
  assert.equal(result.expectedAmount, 248);
  assert.equal(calls.some((call) => call.sql.includes("UPDATE payment_authorizations")), false);
}

function verifyRuntimeValidation() {
  assert.equal(resolveManualLinePayRepaymentRuntime({ env: {} }), "sqlite");
  assert.equal(
    resolveManualLinePayRepaymentRuntime({ env: { MANUAL_LINE_PAY_REPAYMENT_RUNTIME: "POSTGRESQL" } }),
    "postgres"
  );
  assert.throws(
    () => resolveManualLinePayRepaymentRuntime({ runtime: "mysql" }),
    /Unsupported MANUAL_LINE_PAY_REPAYMENT_RUNTIME/
  );
  assert.throws(
    () => createManualLinePayRepaymentRepository({ env: {} }),
    /getRepaymentContext is required/
  );
  assert.throws(
    () => createManualLinePayRepaymentRepository({
      env: {},
      sqliteGateway: { getRepaymentContext: () => {} },
    }),
    /completeRepayment is required/
  );
  assert.throws(
    () => createManualLinePayRepaymentRepository({ runtime: "postgres" }),
    /DATABASE_URL is required/
  );
}

function createFakeContextDatabase(calls, options = {}) {
  return {
    kind: "postgres",
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("FROM payment_authorizations") && sql.includes("payment_flow = 'direct_repayment'")) {
        return { rows: [] };
      }
      if (sql.includes("FROM orders order_record")) {
        return { rows: [{
          id: "order-001",
          customer_user_id: "user-customer-001",
          status: "submitted",
          payment_status: options.paymentStatus || "failed",
          original_amount: 280,
          final_amount: null,
          activity_id: "activity-001",
          activity_status: "failed",
          pickup_start_at: new Date("2026-06-25T16:00:00.000Z"),
          failed_capture_id: "pay-capture-001",
          failed_capture_final_amount: 248,
          failed_capture_attempt_number: 3,
          failed_capture_retryable: !options.terminalFailure,
          original_authorization_id: "pay-auth-001",
          original_provider: "line_pay",
          original_authorization_status: "failed",
          original_provider_transaction_id: "linepay-original-txn",
        }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function createFakeCompletionDatabase(calls, options = {}) {
  const database = {
    kind: "postgres",
    transactionCount: 0,
    async transaction(operation) {
      database.transactionCount += 1;
      return operation({ query });
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM payment_authorizations") && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: "pay-auth-001",
        order_id: "order-001",
        payment_flow: "direct_repayment",
        status: options.authorizationStatus || "pending",
        provider: "line_pay",
        original_amount: 248,
        authorized_amount: 0,
        provider_authorization_id: "linepay-txn-001",
      }] };
    }
    if (sql.includes("SELECT * FROM payment_captures")) {
      return { rows: options.authorizationStatus === "captured" ? [{
        id: "pay-capture-existing",
        payment_authorization_id: "pay-auth-001",
        order_id: "order-001",
        status: "captured",
        final_amount: 248,
        capture_amount: 248,
        released_amount: 0,
      }] : [] };
    }
    if (sql.includes("FROM orders order_record") && sql.includes("FOR UPDATE OF")) {
      return { rows: [{
        id: "order-001",
        activity_id: "activity-001",
        payment_status: "failed",
        activity_status: "failed",
      }] };
    }
    if (sql.includes("UPDATE payment_authorizations")) {
      return { rows: [{ id: "pay-auth-001" }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO payment_captures")) return { rows: [], rowCount: 1 };
    if (sql.includes("UPDATE orders")) return { rows: [], rowCount: 1 };
    if (sql.includes("UPDATE group_buy_activities")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO payment_provider_events")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO status_history")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_logs")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM order_items")) return { rows: [] };
    if (sql.includes("FROM payment_authorizations") && sql.includes("provider IN")) return { rows: [] };
    if (sql.includes("FROM payment_refunds")) return { rows: [] };
    if (sql.includes("FROM orders") && sql.includes("WHERE id = $1")) {
      return { rows: [{
        id: "order-001",
        activity_id: "activity-001",
        customer_user_id: "user-customer-001",
        status: "submitted",
        fallback_purchase_preference: "decline_original_price",
        total_cups: 3,
        original_amount: 248,
        final_amount: 248,
        payment_status: "captured",
        authorization_status: "captured",
        merchant_acceptance_status: "accepted",
        pickup_status: "not_ready",
        submitted_at: new Date("2026-06-25T10:00:00.000Z"),
        updated_at: new Date("2026-06-25T10:16:00.000Z"),
      }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  return database;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
