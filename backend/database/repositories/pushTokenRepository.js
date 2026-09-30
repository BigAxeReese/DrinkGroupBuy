"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

// Identity is the token (UNIQUE(expo_push_token)), not (user_id, expo_push_token) -- see
// database/migrations/009_push_tokens_postgres.sql for why: a token belongs to a device, and the
// upsert repoints user_id when a different user later logs into that same device.
async function upsertPushTokenPostgres(database, { userId, expoPushToken, platform }) {
  await database.query(`
    INSERT INTO push_tokens (id, user_id, expo_push_token, platform, created_at, updated_at)
    VALUES ($1, $2, $3, $4, now(), now())
    ON CONFLICT (expo_push_token)
    DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
  `, [`push-token-${randomUUID()}`, userId, expoPushToken, platform]);
}

// A customer can have several devices, so this returns every token on file for the given users,
// not one per user. Callers are expected to already have deduped userIds.
async function getPushTokensForUsersPostgres(database, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const result = await database.query(
    "SELECT expo_push_token FROM push_tokens WHERE user_id = ANY($1::text[])",
    [userIds]
  );
  return result.rows.map((row) => row.expo_push_token);
}

function createPushTokenRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    upsertPushToken: (value) => upsertPushTokenPostgres(database, value),
    getPushTokensForUsers: (userIds) => getPushTokensForUsersPostgres(database, userIds),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

module.exports = {
  createPushTokenRepository,
};
