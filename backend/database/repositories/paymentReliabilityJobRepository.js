"use strict";

const { createRuntimeDatabaseAdapter } = require("..");
const {
  claimPostgresSettlementJobs,
  completePostgresSettlementJob,
  enqueuePostgresSettlementJob,
  mapJob,
  reschedulePostgresSettlementJob,
} = require("./groupBuySettlementRepository");

function resolvePaymentReliabilityJobRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.PAYMENT_RELIABILITY_JOB_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported PAYMENT_RELIABILITY_JOB_RUNTIME: ${runtime}`);
}

function createPaymentReliabilityJobRepository(input = {}) {
  const runtime = resolvePaymentReliabilityJobRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of [
      "enqueueJob",
      "claimJobs",
      "completeJob",
      "rescheduleJob",
      "listPendingLinePayAuthorizations",
      "listAlerts",
    ]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when PAYMENT_RELIABILITY_JOB_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      enqueueJob: async (value) => gateway.enqueueJob(value),
      claimJobs: async (value) => gateway.claimJobs(value),
      completeJob: async (value) => gateway.completeJob(value),
      rescheduleJob: async (value) => gateway.rescheduleJob(value),
      listPendingLinePayAuthorizations: async (value) => gateway.listPendingLinePayAuthorizations(value),
      listAlerts: async (value) => gateway.listAlerts(value),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({
    ...input,
    runtime: "postgres",
  });
  return {
    kind: "postgres",
    enqueueJob: (value) => enqueuePostgresSettlementJob(database, value),
    claimJobs: (value) => claimPostgresSettlementJobs(database, value),
    completeJob: (value) => completePostgresSettlementJob(database, value),
    rescheduleJob: (value) => reschedulePostgresSettlementJob(database, value),
    listPendingLinePayAuthorizations: (value) => (
      listPostgresPendingLinePayAuthorizations(database, value)
    ),
    listAlerts: (value) => listPostgresPaymentReliabilityAlerts(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function listPostgresPendingLinePayAuthorizations(database, input = {}) {
  const limit = Math.min(Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 100, 500);
  // "authorization" is a reserved word in PostgreSQL (used in CREATE SCHEMA ... AUTHORIZATION
  // / SET SESSION AUTHORIZATION syntax) and cannot be used as a bare table alias -- confirmed
  // against a real PostgreSQL 16 server, since the fake-database unit tests never actually
  // parse SQL through a real engine. Aliased as payment_auth instead, matching the convention
  // already used correctly elsewhere (e.g. paymentAuthorizationConfirmRepository.js).
  const result = await database.query(`
    SELECT
      payment_auth.id,
      payment_auth.order_id,
      payment_auth.order_revision_id,
      payment_auth.provider_authorization_id,
      payment_auth.payment_flow,
      payment_auth.original_amount,
      payment_auth.created_at
    FROM payment_authorizations payment_auth
    WHERE payment_auth.provider = 'line_pay'
      AND payment_auth.status = 'pending'
      AND payment_auth.provider_authorization_id IS NOT NULL
    ORDER BY payment_auth.created_at ASC
    LIMIT $1
  `, [limit]);
  return result.rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderRevisionId: row.order_revision_id,
    providerTransactionId: row.provider_authorization_id,
    paymentFlow: row.payment_flow || "authorization",
    amount: row.original_amount,
    createdAt: toIsoString(row.created_at),
  }));
}

async function listPostgresPaymentReliabilityAlerts(database, input = {}) {
  const limit = Math.min(Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 50, 200);
  const result = await database.query(`
    SELECT *
    FROM payment_reliability_jobs
    WHERE alert_required = true
      AND ($1::text IS NULL OR job_type = $1)
      AND ($2::text IS NULL OR status = $2)
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $3
  `, [input.jobType || null, input.status || null, limit]);
  return result.rows.map(mapJob);
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createPaymentReliabilityJobRepository,
  listPostgresPaymentReliabilityAlerts,
  listPostgresPendingLinePayAuthorizations,
  resolvePaymentReliabilityJobRuntime,
};
