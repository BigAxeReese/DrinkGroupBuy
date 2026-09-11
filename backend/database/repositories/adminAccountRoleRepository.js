"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

function createAdminAccountRoleRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    listAccounts: (value) => listAccountsPostgres(database, value),
    setActiveRole: (value) => setActiveRolePostgres(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function listAccountsPostgres(database, input = {}) {
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 100) : "";
  const result = await database.query(`
    SELECT
      user_account.id,
      user_account.email,
      user_account.display_name,
      user_account.status,
      ARRAY(
        SELECT user_role.role
        FROM user_roles user_role
        WHERE user_role.user_id = user_account.id
          AND user_role.status = 'active'
        ORDER BY user_role.role
      ) AS active_roles,
      merchant_user.id AS merchant_user_id,
      merchant_user.status AS merchant_user_status,
      store.id AS store_id,
      store.name AS store_name,
      merchant.status AS merchant_status
    FROM users user_account
    LEFT JOIN merchant_users merchant_user ON merchant_user.user_id = user_account.id
    LEFT JOIN stores store ON store.id = merchant_user.store_id
    LEFT JOIN merchants merchant ON merchant.id = store.merchant_id
    WHERE (
        $1 = ''
        OR user_account.id ILIKE '%' || $1 || '%'
        OR COALESCE(user_account.email, '') ILIKE '%' || $1 || '%'
        OR user_account.display_name ILIKE '%' || $1 || '%'
        OR COALESCE(store.name, '') ILIKE '%' || $1 || '%'
      )
    ORDER BY user_account.created_at DESC, user_account.id ASC
  `, [search]);
  return result.rows.map(mapAccount);
}

async function setActiveRolePostgres(database, input = {}) {
  const now = input.now || new Date().toISOString();

  return database.transaction(async (transaction) => {
    const userResult = await transaction.query(
      "SELECT id, status FROM users WHERE id = $1 FOR UPDATE",
      [input.userId]
    );
    const user = userResult.rows[0];
    if (!user) return { error: "account_not_found" };
    if (user.status !== "active") return { error: "account_disabled" };

    const rolesResult = await transaction.query(
      "SELECT role, status FROM user_roles WHERE user_id = $1 FOR UPDATE",
      [input.userId]
    );
    if (rolesResult.rows.some((role) => role.role === "admin")) {
      return { error: "admin_account_protected" };
    }

    const merchantResult = await transaction.query(`
      SELECT
        merchant_user.id,
        merchant_user.status,
        store.id AS store_id,
        store.name AS store_name,
        merchant.status AS merchant_status
      FROM merchant_users merchant_user
      JOIN stores store ON store.id = merchant_user.store_id
      JOIN merchants merchant ON merchant.id = store.merchant_id
      WHERE merchant_user.user_id = $1
      FOR UPDATE OF merchant_user
    `, [input.userId]);
    const merchantProfile = merchantResult.rows[0] || null;

    if (input.targetRole === "merchant" && !merchantProfile) {
      return { error: "merchant_profile_required" };
    }
    if (input.targetRole === "merchant" && merchantProfile.merchant_status !== "active") {
      return { error: "merchant_profile_disabled" };
    }

    const activeRoles = rolesResult.rows
      .filter((role) => role.status === "active")
      .map((role) => role.role)
      .sort();
    const alreadyActive = input.targetRole === "merchant"
      ? activeRoles.length === 1
        && activeRoles[0] === "merchant"
        && merchantProfile.status === "active"
      : activeRoles.length === 1
        && activeRoles[0] === "customer"
        && (!merchantProfile || merchantProfile.status === "disabled");

    if (alreadyActive) {
      return buildRoleChangeResult(input.userId, input.targetRole, false, merchantProfile);
    }

    await transaction.query(`
      INSERT INTO user_roles (id, user_id, role, status, granted_at)
      VALUES ($1, $2, $3, 'active', $4)
      ON CONFLICT (user_id, role) DO UPDATE SET status = 'active'
    `, [`user-role-${randomUUID()}`, input.userId, input.targetRole, now]);

    const roleToDisable = input.targetRole === "merchant" ? "customer" : "merchant";
    await transaction.query(`
      UPDATE user_roles
      SET status = 'disabled'
      WHERE user_id = $1
        AND role = $2
        AND status != 'disabled'
    `, [input.userId, roleToDisable]);

    if (merchantProfile) {
      await transaction.query(`
        UPDATE merchant_users
        SET status = $1
        WHERE id = $2
      `, [input.targetRole === "merchant" ? "active" : "disabled", merchantProfile.id]);
    }

    await transaction.query(
      "UPDATE users SET updated_at = $1 WHERE id = $2",
      [now, input.userId]
    );
    await insertAudit(transaction, {
      actorUserId: input.actorUserId,
      userId: input.userId,
      previousActiveRoles: activeRoles,
      targetRole: input.targetRole,
      merchantUserStatusBefore: merchantProfile?.status || null,
      now,
    });

    return buildRoleChangeResult(input.userId, input.targetRole, true, merchantProfile);
  });
}

function buildRoleChangeResult(userId, activeRole, changed, merchantProfile) {
  return {
    userId,
    activeRole,
    changed,
    merchantStore: merchantProfile
      ? { id: merchantProfile.store_id, name: merchantProfile.store_name }
      : null,
  };
}

async function insertAudit(database, input) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, $2, 'admin_account_role_changed', 'user', $3, $4::jsonb, $5)
  `, [
    `audit-log-${randomUUID()}`,
    input.actorUserId,
    input.userId,
    JSON.stringify({
      previousActiveRoles: input.previousActiveRoles,
      targetRole: input.targetRole,
      merchantUserStatusBefore: input.merchantUserStatusBefore,
    }),
    input.now,
  ]);
}

function mapAccount(row) {
  const activeRoles = Array.isArray(row.active_roles) ? row.active_roles : [];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    activeRole: activeRoles.includes("admin")
      ? "admin"
      : activeRoles.includes("merchant")
        ? "merchant"
        : activeRoles.includes("customer")
          ? "customer"
          : null,
    activeRoles,
    protectedAdmin: activeRoles.includes("admin"),
    merchantProfileAvailable: Boolean(
      row.merchant_user_id && row.store_id && row.merchant_status === "active"
    ),
    merchantUserStatus: row.merchant_user_status || null,
    merchantStore: row.store_id
      ? { id: row.store_id, name: row.store_name }
      : null,
  };
}

module.exports = {
  createAdminAccountRoleRepository,
};
