"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

// The one place this error code is defined -- backend/server.js imports it instead of retyping
// the literal at each of its two call sites (the customer/merchant route and the admin login
// page's inline script). Mobile's RoleSelectScreen.jsx still matches it as its own literal: it
// ships as a separate React Native bundle with no shared module system with the backend, same as
// every other error code this app already returns (see server.js's existing "Keep in sync with…"
// comments on describeBackendError/getLoginErrorMessage).
const EMAIL_REGISTRATION_DISABLED_ERROR = "email_registration_disabled";

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

// Self-service registration is temporarily Google-only: anyone can still create a raw Firebase
// email/password account directly through Firebase's own API, but this function won't turn a
// first-time one into a real user row unless ALLOW_EMAIL_PASSWORD_REGISTRATION is explicitly
// enabled. Centralized here (not at each caller) so every current and future caller of
// resolveOrRegisterCustomer inherits the same policy automatically, instead of each one having to
// remember to check signInProvider itself.
function isEmailPasswordRegistrationEnabled() {
  return readBooleanEnv(process.env.ALLOW_EMAIL_PASSWORD_REGISTRATION, false);
}

function readBooleanEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

// Only ever called with claims taken directly from a verified Firebase ID token (see
// backend/server.js) -- never from request-body fields a client could set itself.
async function resolveOrRegisterCustomerPostgres(database, input = {}) {
  const { firebaseUid, email, displayName, signInProvider } = input;
  const now = input.now || new Date().toISOString();

  // Look up by firebase_uid regardless of status -- a disabled/deleted account must be rejected,
  // not silently treated as "never seen this UID before" and re-created.
  const existing = await database.query(
    "SELECT id, status FROM users WHERE firebase_uid = $1", [firebaseUid]
  );
  if (existing.rows[0]) {
    return finalizeExistingUser(existing.rows[0]);
  }

  // An already-registered email/password account is unaffected by this -- it was matched by the
  // firebase_uid lookup above and returned already, so it never reaches this point. This only
  // stops a brand-new email/password sign-in from creating its first row.
  if (signInProvider === "password" && !isEmailPasswordRegistrationEnabled()) {
    return { error: EMAIL_REGISTRATION_DISABLED_ERROR };
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
  EMAIL_REGISTRATION_DISABLED_ERROR,
};
