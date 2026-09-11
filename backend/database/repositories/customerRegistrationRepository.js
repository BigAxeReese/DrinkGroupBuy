"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

// Postgres-only, same reasoning as merchantApplicationRepository.js: this is the first runtime
// path that creates a *customer* user record from a first Google login, there is no legacy
// SQLite behavior to preserve, and AUTH_PROFILE_READ_RUNTIME has already permanently moved to
// postgres (see AGENTS.md).
function createCustomerRegistrationRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    resolveOrRegisterCustomer: (value) => resolveOrRegisterCustomerPostgres(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

// Only ever called with claims taken directly from a verified Firebase ID token (see
// backend/server.js) -- never from request-body fields a client could set itself.
async function resolveOrRegisterCustomerPostgres(database, input = {}) {
  const { firebaseUid, email, displayName } = input;
  const now = input.now || new Date().toISOString();

  // Look up by firebase_uid regardless of status -- a disabled/deleted account must be rejected,
  // not silently treated as "never seen this UID before" and re-created.
  const existing = await database.query(
    "SELECT id, status FROM users WHERE firebase_uid = $1", [firebaseUid]
  );
  if (existing.rows[0]) {
    return finalizeExistingUser(existing.rows[0]);
  }

  const userId = `user-${randomUUID()}`;
  try {
    return await database.transaction(async (transaction) => {
      await transaction.query(`
        INSERT INTO users (id, firebase_uid, email, display_name, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'active', $5, $5)
      `, [userId, firebaseUid, email || null, displayName, now]);

      await transaction.query(`
        INSERT INTO user_roles (id, user_id, role, status, granted_at)
        VALUES ($1, $2, 'customer', 'active', $3)
      `, [`user-role-${randomUUID()}`, userId, now]);

      await insertAudit(transaction, "customer_self_registered", userId, { firebaseUid }, userId, now);

      return { userId, created: true };
    });
  } catch (error) {
    // Two concurrent first logins from the same account can both pass the "does a row exist yet?"
    // SELECT above before either commits -- the UNIQUE constraint on firebase_uid is the real
    // guard, same pattern as merchantApplicationRepository's pending-application index.
    if (error?.code === "23505" && error?.constraint === "users_firebase_uid_key") {
      const winner = await database.query("SELECT id, status FROM users WHERE firebase_uid = $1", [firebaseUid]);
      return finalizeExistingUser(winner.rows[0]);
    }
    // A different, already-existing account (typically a manually-seeded one whose firebase_uid
    // isn't mapped yet) owns this email -- fail closed instead of guessing that it's the same
    // person or silently creating a duplicate account.
    if (error?.code === "23505" && error?.constraint === "users_email_key") {
      return { error: "email_already_registered" };
    }
    throw error;
  }
}

function finalizeExistingUser(user) {
  if (!user || user.status !== "active") {
    return { error: "account_disabled" };
  }
  return { userId: user.id, created: false };
}

async function insertAudit(database, actionType, resourceId, metadata, actorUserId, now) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, $2, $3, 'user', $4, $5::jsonb, $6)
  `, [`audit-log-${randomUUID()}`, actorUserId || null, actionType, resourceId, JSON.stringify(metadata), now]);
}

module.exports = {
  createCustomerRegistrationRepository,
};
