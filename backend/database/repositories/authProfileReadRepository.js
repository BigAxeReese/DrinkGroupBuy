"use strict";

const { createRuntimeDatabaseAdapter } = require("..");

function resolveAuthProfileReadRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.AUTH_PROFILE_READ_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported AUTH_PROFILE_READ_RUNTIME: ${runtime}`);
}

function createAuthProfileReadRepository(input = {}) {
  const runtime = resolveAuthProfileReadRuntime(input);
  if (runtime === "sqlite") {
    const requiredReaders = [
      "getByFirebaseUid",
      "getByLoginIdentifier",
      "getById",
      "listDevUsers",
    ];
    for (const readerName of requiredReaders) {
      if (typeof input.sqliteReaders?.[readerName] !== "function") {
        throw new Error(
          `sqliteReaders.${readerName} is required when AUTH_PROFILE_READ_RUNTIME=sqlite`
        );
      }
    }
    return {
      kind: "sqlite",
      getByFirebaseUid: async (firebaseUid) => input.sqliteReaders.getByFirebaseUid(firebaseUid),
      getByLoginIdentifier: async (identifier) => (
        input.sqliteReaders.getByLoginIdentifier(identifier)
      ),
      getById: async (userId) => input.sqliteReaders.getById(userId),
      listDevUsers: async () => input.sqliteReaders.listDevUsers(),
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
    getByFirebaseUid: (firebaseUid) => getPostgresAuthProfileByFirebaseUid(database, firebaseUid),
    getByLoginIdentifier: (identifier) => (
      getPostgresAuthProfileByLoginIdentifier(database, identifier)
    ),
    getById: (userId) => getPostgresAuthProfileById(database, userId),
    listDevUsers: () => listPostgresDevAuthUsers(database),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getPostgresAuthProfileByFirebaseUid(database, firebaseUid) {
  const result = await database.query(`
    SELECT
      user_account.id,
      user_account.login_name,
      COALESCE(private_profile.contact_phone, user_account.phone_number) AS phone_number,
      COALESCE(private_profile.contact_email, user_account.email) AS email,
      user_account.password_hash,
      user_account.display_name
    FROM users user_account
    LEFT JOIN user_private_profiles private_profile
      ON private_profile.user_id = user_account.id
    WHERE user_account.firebase_uid = $1
      AND user_account.status = 'active'
    LIMIT 1
  `, [firebaseUid]);
  return hydrateSinglePostgresAuthProfile(database, result.rows[0]);
}

async function getPostgresAuthProfileByLoginIdentifier(database, identifier) {
  const result = await database.query(`
    SELECT
      user_account.id,
      user_account.login_name,
      COALESCE(private_profile.contact_phone, user_account.phone_number) AS phone_number,
      COALESCE(private_profile.contact_email, user_account.email) AS email,
      user_account.password_hash,
      user_account.display_name
    FROM users user_account
    LEFT JOIN user_private_profiles private_profile
      ON private_profile.user_id = user_account.id
    WHERE (
        user_account.phone_number = $1
        OR private_profile.contact_phone = $1
        OR lower(user_account.login_name) = lower($1)
        OR lower(user_account.email) = lower($1)
        OR lower(private_profile.contact_email) = lower($1)
      )
      AND user_account.status = 'active'
    LIMIT 1
  `, [identifier]);
  return hydrateSinglePostgresAuthProfile(database, result.rows[0]);
}

async function getPostgresAuthProfileById(database, userId) {
  const result = await database.query(`
    SELECT
      user_account.id,
      user_account.login_name,
      COALESCE(private_profile.contact_phone, user_account.phone_number) AS phone_number,
      COALESCE(private_profile.contact_email, user_account.email) AS email,
      user_account.password_hash,
      user_account.display_name
    FROM users user_account
    LEFT JOIN user_private_profiles private_profile
      ON private_profile.user_id = user_account.id
    WHERE user_account.id = $1
      AND user_account.status = 'active'
    LIMIT 1
  `, [userId]);
  return hydrateSinglePostgresAuthProfile(database, result.rows[0]);
}

async function listPostgresDevAuthUsers(database) {
  const result = await database.query(`
    SELECT DISTINCT
      user_account.id,
      user_account.login_name,
      COALESCE(private_profile.contact_phone, user_account.phone_number) AS phone_number,
      COALESCE(private_profile.contact_email, user_account.email) AS email,
      user_account.password_hash,
      user_account.display_name
    FROM users user_account
    LEFT JOIN user_private_profiles private_profile
      ON private_profile.user_id = user_account.id
    JOIN user_roles user_role
      ON user_role.user_id = user_account.id
    WHERE user_account.status = 'active'
      AND user_role.status = 'active'
      AND user_role.role IN ('customer', 'merchant', 'admin')
    ORDER BY user_account.id ASC
  `);
  const users = await hydratePostgresAuthProfiles(database, result.rows);
  return users.map(toDevAuthUser);
}

async function hydrateSinglePostgresAuthProfile(database, row) {
  if (!row) return null;
  const users = await hydratePostgresAuthProfiles(database, [row]);
  return users[0] || null;
}

async function hydratePostgresAuthProfiles(database, rows) {
  if (rows.length === 0) return [];
  const userIds = rows.map((row) => row.id);
  const [rolesResult, storesResult] = await Promise.all([
    database.query(`
      SELECT user_id, role
      FROM user_roles
      WHERE user_id = ANY($1::text[])
        AND status = 'active'
      ORDER BY role ASC
    `, [userIds]),
    database.query(`
      SELECT
        merchant_user.user_id,
        store.id,
        store.name,
        store.merchant_id
      FROM merchant_users merchant_user
      JOIN stores store ON store.id = merchant_user.store_id
      WHERE merchant_user.user_id = ANY($1::text[])
        AND merchant_user.status = 'active'
      ORDER BY store.name ASC
    `, [userIds]),
  ]);

  return rows.map((row) => ({
    id: row.id,
    loginName: row.login_name,
    phoneNumber: row.phone_number,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    surname: null,
    roles: rolesResult.rows
      .filter((role) => role.user_id === row.id)
      .map((role) => role.role),
    merchantStores: storesResult.rows
      .filter((store) => store.user_id === row.id)
      .map((store) => ({
        id: store.id,
        name: store.name,
        merchantId: store.merchant_id,
        permissionLevel: null,
      })),
  }));
}

function toDevAuthUser(user) {
  const primaryRole = user.roles.includes("customer")
    ? "customer"
    : user.roles.includes("merchant")
      ? "merchant"
      : user.roles[0] || "unknown";
  const store = user.merchantStores[0] || null;
  return {
    id: user.id,
    loginName: user.loginName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    displayName: user.displayName,
    surname: user.surname,
    roles: user.roles,
    merchantStores: user.merchantStores,
    primaryRole,
    label: buildDevAuthUserLabel(user, primaryRole, store),
  };
}

function buildDevAuthUserLabel(user, primaryRole, store) {
  if (primaryRole === "customer") {
    return `顧客：${readableText(user.displayName) || user.loginName || user.id}`;
  }
  if (primaryRole === "merchant") {
    const storeLabel = readableText(store?.name) || store?.id;
    const accountLabel = readableText(user.loginName) || user.email || user.id;
    return `商家：${storeLabel || accountLabel}${
      storeLabel && accountLabel ? ` / ${accountLabel}` : ""
    }`;
  }
  if (primaryRole === "admin") return "開發補救：管理員";
  return readableText(user.displayName) || user.loginName || user.id;
}

function readableText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /^[?\s]+$/.test(text)) return null;
  return text;
}

module.exports = {
  createAuthProfileReadRepository,
  getPostgresAuthProfileByFirebaseUid,
  getPostgresAuthProfileById,
  getPostgresAuthProfileByLoginIdentifier,
  hydratePostgresAuthProfiles,
  listPostgresDevAuthUsers,
  resolveAuthProfileReadRuntime,
};
