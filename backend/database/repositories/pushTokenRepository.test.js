"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPushTokenRepository } = require("./pushTokenRepository");

function createFakeDatabase(rows = []) {
  const queries = [];
  return {
    queries,
    database: {
      async query(sql, parameters = []) {
        queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), parameters });
        return { rows };
      },
    },
  };
}

test("upsertPushToken binds userId/expoPushToken/platform as parameters, not interpolated", async () => {
  const fake = createFakeDatabase();
  const repository = createPushTokenRepository({ database: fake.database });

  await repository.upsertPushToken({
    userId: "user-001'; DROP TABLE push_tokens; --",
    expoPushToken: "ExponentPushToken[abc123]",
    platform: "android",
  });

  assert.equal(fake.queries.length, 1);
  const { sql, parameters } = fake.queries[0];
  assert.match(sql, /INSERT INTO push_tokens/);
  assert.match(sql, /ON CONFLICT \(expo_push_token\)/);
  assert.match(sql, /DO UPDATE SET user_id = excluded\.user_id, platform = excluded\.platform, updated_at = now\(\)/);
  assert.ok(!sql.includes("DROP TABLE"));
  assert.equal(parameters[1], "user-001'; DROP TABLE push_tokens; --");
  assert.equal(parameters[2], "ExponentPushToken[abc123]");
  assert.equal(parameters[3], "android");
});

test("upsertPushToken repoints an existing token's user_id instead of creating a duplicate row", async () => {
  // The fake database can't enforce the real UNIQUE(expo_push_token) constraint, so this test
  // only proves the query text carries an ON CONFLICT upsert -- the real-Postgres smoke script
  // is what proves the constraint + upsert actually repoints the row.
  const fake = createFakeDatabase();
  const repository = createPushTokenRepository({ database: fake.database });

  await repository.upsertPushToken({ userId: "user-old", expoPushToken: "token-shared", platform: "ios" });
  await repository.upsertPushToken({ userId: "user-new", expoPushToken: "token-shared", platform: "ios" });

  assert.equal(fake.queries.length, 2);
  assert.match(fake.queries[1].sql, /ON CONFLICT \(expo_push_token\) DO UPDATE SET user_id = excluded\.user_id/);
});

test("getPushTokensForUsers returns every token for the given users", async () => {
  const fake = createFakeDatabase([
    { expo_push_token: "token-a" },
    { expo_push_token: "token-b" },
  ]);
  const repository = createPushTokenRepository({ database: fake.database });

  const tokens = await repository.getPushTokensForUsers(["user-1", "user-2"]);

  assert.deepEqual(tokens, ["token-a", "token-b"]);
  assert.equal(fake.queries.length, 1);
  assert.deepEqual(fake.queries[0].parameters, [["user-1", "user-2"]]);
  assert.match(fake.queries[0].sql, /WHERE user_id = ANY\(\$1::text\[\]\)/);
});

test("getPushTokensForUsers skips the query entirely for an empty or missing user list", async () => {
  const fake = createFakeDatabase([{ expo_push_token: "should-not-be-returned" }]);
  const repository = createPushTokenRepository({ database: fake.database });

  assert.deepEqual(await repository.getPushTokensForUsers([]), []);
  assert.deepEqual(await repository.getPushTokensForUsers(undefined), []);
  assert.equal(fake.queries.length, 0);
});
