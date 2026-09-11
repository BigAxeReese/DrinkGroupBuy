"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

// Unlike every other repository in this folder, this one is Postgres-only from day one -- there
// is no legacy SQLite implementation to preserve (self-service merchant applications didn't
// exist before this feature), and this project's runtime has already permanently switched to
// PostgreSQL (see AGENTS.md). Building a parallel SQLite path purely for consistency, with no
// test ever exercising it, would be dead weight -- so this constructor skips the
// sqliteGateway/runtime-resolution branch every other repository has and always returns a
// Postgres-backed implementation.
function createMerchantApplicationRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    createApplication: (value) => createApplicationPostgres(database, value),
    approveApplication: (value) => approveApplicationPostgres(database, value),
    rejectApplication: (value) => rejectApplicationPostgres(database, value),
    getApplicationById: (value) => getApplicationByIdPostgres(database, value),
    listApplicationsForAdmin: (value) => listApplicationsForAdminPostgres(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function createApplicationPostgres(database, input = {}) {
  const now = input.now || new Date().toISOString();
  const applicationId = `merchant-application-${randomUUID()}`;

  try {
    return await database.transaction(async (transaction) => {
      await transaction.query(`
        INSERT INTO merchant_applications (
          id, applicant_firebase_uid, applicant_email, applicant_display_name,
          contact_phone, store_name, address, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $8)
      `, [
        applicationId, input.applicantFirebaseUid, input.applicantEmail || null,
        input.applicantDisplayName || null, input.contactPhone, input.storeName, input.address, now,
      ]);
      await insertAudit(transaction, "merchant_application_submitted", applicationId, {
        applicantFirebaseUid: input.applicantFirebaseUid,
        storeName: input.storeName,
      }, null, now);

      const created = await transaction.query("SELECT * FROM merchant_applications WHERE id = $1", [applicationId]);
      return { application: mapMerchantApplication(created.rows[0]), alreadyExists: false };
    });
  } catch (error) {
    // Same reasoning as createRefundRequestPostgres's equivalent catch (paymentRefundRepository.js):
    // two concurrent submissions from the same applicant can both pass an in-transaction "is there
    // already a pending one?" SELECT before either commits -- Postgres doesn't serialize concurrent
    // transactions the way SQLite's whole-file lock does. This unique index is the real guard.
    if (error?.code === "23505" && error?.constraint === "idx_merchant_applications_pending_per_applicant") {
      const existingPending = await database.query(
        "SELECT * FROM merchant_applications WHERE applicant_firebase_uid = $1 AND status = 'pending' LIMIT 1",
        [input.applicantFirebaseUid]
      );
      return {
        error: "application_already_pending",
        application: existingPending.rows[0] ? mapMerchantApplication(existingPending.rows[0]) : null,
      };
    }
    throw error;
  }
}

async function approveApplicationPostgres(database, input = {}) {
  const now = input.now || new Date().toISOString();

  return database.transaction(async (transaction) => {
    const existingResult = await transaction.query(
      "SELECT * FROM merchant_applications WHERE id = $1 FOR UPDATE", [input.applicationId]
    );
    const existing = existingResult.rows[0];
    if (!existing || existing.status !== "pending") {
      return { application: existing ? mapMerchantApplication(existing) : null };
    }

    // Resolve (reuse or create) the users row for this applicant inside the same transaction --
    // reuse covers an applicant who already self-registered as a customer via Google login
    // (see customerRegistrationRepository.js); their customer role gets converted below.
    const userResult = await transaction.query(
      "SELECT id FROM users WHERE firebase_uid = $1", [existing.applicant_firebase_uid]
    );
    let userId = userResult.rows[0]?.id;
    if (!userId) {
      userId = `user-${randomUUID()}`;
      await transaction.query(`
        INSERT INTO users (id, firebase_uid, email, display_name, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'active', $5, $5)
      `, [
        userId, existing.applicant_firebase_uid, existing.applicant_email,
        existing.applicant_display_name || existing.store_name, now,
      ]);
    }

    const merchantId = `merchant-${randomUUID()}`;
    await transaction.query(`
      INSERT INTO merchants (id, name, status, created_at, updated_at)
      VALUES ($1, $2, 'active', $3, $3)
    `, [merchantId, existing.store_name, now]);

    const storeId = `store-${randomUUID()}`;
    await transaction.query(`
      INSERT INTO stores (
        id, merchant_id, name, address, phone, business_status, latitude, longitude, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $8)
    `, [storeId, merchantId, existing.store_name, existing.address, existing.contact_phone,
      input.latitude, input.longitude, now]);

    // merchant_users.user_id is UNIQUE (one merchant login maps to exactly one store) -- if this
    // applicant's Google account is already linked to a different store, this insert throws a
    // 23505 the outer catch below turns into a clean, whole-transaction rollback: no orphaned
    // merchants/stores rows left behind from a partially-applied approval.
    try {
      await transaction.query(`
        INSERT INTO merchant_users (id, store_id, user_id, status, created_at)
        VALUES ($1, $2, $3, 'active', $4)
      `, [`merchant-user-${randomUUID()}`, storeId, userId, now]);
    } catch (error) {
      if (error?.code === "23505") {
        return { error: "applicant_already_merchant" };
      }
      throw error;
    }

    await transaction.query(`
      INSERT INTO user_roles (id, user_id, role, status, granted_at)
      VALUES ($1, $2, 'merchant', 'active', $3)
      ON CONFLICT (user_id, role) DO UPDATE SET status = 'active'
    `, [`user-role-${randomUUID()}`, userId, now]);

    // Per explicit product decision, this account converts to a merchant rather than holding both
    // roles at once -- if this applicant already had an active customer role (from a prior
    // self-registered Google login), turn it off instead of leaving both active.
    const customerRoleConversion = await transaction.query(`
      UPDATE user_roles SET status = 'disabled'
      WHERE user_id = $1 AND role = 'customer' AND status = 'active'
      RETURNING id
    `, [userId]);
    const customerRoleConverted = customerRoleConversion.rows.length > 0;

    await transaction.query(`
      UPDATE merchant_applications
      SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = $2,
          resulting_merchant_id = $3, resulting_store_id = $4, resulting_user_id = $5, updated_at = $2
      WHERE id = $6 AND status = 'pending'
    `, [input.actorUserId || null, now, merchantId, storeId, userId, input.applicationId]);
    await insertAudit(transaction, "merchant_application_approved", input.applicationId,
      { merchantId, storeId, userId, latitude: input.latitude, longitude: input.longitude, customerRoleConverted },
      input.actorUserId, now);

    const updated = await transaction.query("SELECT * FROM merchant_applications WHERE id = $1", [input.applicationId]);
    return { application: mapMerchantApplication(updated.rows[0]) };
  });
}

async function rejectApplicationPostgres(database, input = {}) {
  const now = input.now || new Date().toISOString();

  return database.transaction(async (transaction) => {
    const existingResult = await transaction.query(
      "SELECT * FROM merchant_applications WHERE id = $1 FOR UPDATE", [input.applicationId]
    );
    const existing = existingResult.rows[0];
    if (!existing || existing.status !== "pending") {
      return existing ? mapMerchantApplication(existing) : null;
    }

    await transaction.query(`
      UPDATE merchant_applications
      SET status = 'rejected', reviewed_by_user_id = $1, reviewed_at = $2,
          rejection_reason = $3, updated_at = $2
      WHERE id = $4 AND status = 'pending'
    `, [input.actorUserId || null, now, input.rejectionReason, input.applicationId]);
    await insertAudit(transaction, "merchant_application_rejected", input.applicationId,
      { rejectionReason: input.rejectionReason }, input.actorUserId, now);

    const updated = await transaction.query("SELECT * FROM merchant_applications WHERE id = $1", [input.applicationId]);
    return mapMerchantApplication(updated.rows[0]);
  });
}

async function getApplicationByIdPostgres(database, input = {}) {
  const result = await database.query("SELECT * FROM merchant_applications WHERE id = $1", [input.applicationId]);
  return result.rows[0] ? mapMerchantApplication(result.rows[0]) : null;
}

async function listApplicationsForAdminPostgres(database, input = {}) {
  const result = input.status
    ? await database.query(
        "SELECT * FROM merchant_applications WHERE status = $1 ORDER BY created_at DESC", [input.status]
      )
    : await database.query("SELECT * FROM merchant_applications ORDER BY created_at DESC");
  return result.rows.map(mapMerchantApplication);
}

async function insertAudit(database, actionType, resourceId, metadata, actorUserId, now) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, $2, $3, 'merchant_application', $4, $5::jsonb, $6)
  `, [`audit-log-${randomUUID()}`, actorUserId || null, actionType, resourceId, JSON.stringify(metadata), now]);
}

function mapMerchantApplication(row) {
  return {
    id: row.id,
    applicantFirebaseUid: row.applicant_firebase_uid,
    applicantEmail: row.applicant_email,
    applicantDisplayName: row.applicant_display_name,
    contactPhone: row.contact_phone,
    storeName: row.store_name,
    address: row.address,
    status: row.status,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: toIsoString(row.reviewed_at),
    rejectionReason: row.rejection_reason,
    resultingMerchantId: row.resulting_merchant_id,
    resultingStoreId: row.resulting_store_id,
    resultingUserId: row.resulting_user_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createMerchantApplicationRepository,
};
