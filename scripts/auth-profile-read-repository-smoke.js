"use strict";

const assert = require("node:assert/strict");
const {
  createAuthProfileReadRepository,
  resolveAuthProfileReadRuntime,
} = require("../backend/database/repositories/authProfileReadRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresContract();
  await verifyMissingPostgresUser();
  verifyRuntimeValidation();
  console.log("Auth profile read repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const calls = [];
  const repository = createAuthProfileReadRepository({
    env: {},
    sqliteReaders: {
      getByFirebaseUid(value) {
        calls.push(["firebase", value]);
        return { id: "sqlite-firebase" };
      },
      getByLoginIdentifier(value) {
        calls.push(["identifier", value]);
        return { id: "sqlite-identifier" };
      },
      getById(value) {
        calls.push(["id", value]);
        return { id: "sqlite-id" };
      },
      listDevUsers() {
        calls.push(["list"]);
        return [{ id: "sqlite-list" }];
      },
    },
  });

  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.getByFirebaseUid("firebase-1"), { id: "sqlite-firebase" });
  assert.deepEqual(await repository.getByLoginIdentifier("merchant1"), { id: "sqlite-identifier" });
  assert.deepEqual(await repository.getById("user-1"), { id: "sqlite-id" });
  assert.deepEqual(await repository.listDevUsers(), [{ id: "sqlite-list" }]);
  assert.deepEqual(calls, [
    ["firebase", "firebase-1"],
    ["identifier", "merchant1"],
    ["id", "user-1"],
    ["list"],
  ]);
  await repository.close();
}

async function verifyPostgresContract() {
  const calls = [];
  const database = createFakePostgresDatabase(calls);
  const repository = createAuthProfileReadRepository({ runtime: "postgres", database });

  assert.equal(repository.kind, "postgres");
  const merchant = await repository.getByFirebaseUid("firebase-merchant");
  assert.deepEqual(merchant, expectedMerchantProfile());

  assert.deepEqual(await repository.getById("user-merchant-pg"), expectedMerchantProfile());
  assert.deepEqual(
    await repository.getByLoginIdentifier("private-merchant@example.com"),
    expectedMerchantProfile()
  );

  const devUsers = await repository.listDevUsers();
  assert.equal(devUsers.length, 2);
  assert.equal(devUsers[0].primaryRole, "admin");
  assert.equal(devUsers[0].label, "開發補救：管理員");
  assert.equal(devUsers[1].primaryRole, "merchant");
  assert.equal(devUsers[1].label, "商家：PostgreSQL 測試店 / merchantpg");
  assert.equal(devUsers[1].merchantStores[0].permissionLevel, null);

  const firebaseCall = calls.find((call) => call.sql.includes("firebase_uid = $1"));
  assert.deepEqual(firebaseCall.parameters, ["firebase-merchant"]);
  const identifierCall = calls.find((call) => (
    call.sql.includes("lower(private_profile.contact_email) = lower($1)")
  ));
  assert.deepEqual(identifierCall.parameters, ["private-merchant@example.com"]);
  assert.ok(calls.some((call) => call.sql.includes("merchant_user.store_id")));
  await repository.close();
}

async function verifyMissingPostgresUser() {
  const repository = createAuthProfileReadRepository({
    runtime: "postgresql",
    database: {
      query: async () => ({ rows: [] }),
    },
  });
  assert.equal(await repository.getById("missing"), null);
}

function verifyRuntimeValidation() {
  assert.equal(resolveAuthProfileReadRuntime({ env: {} }), "sqlite");
  assert.equal(
    resolveAuthProfileReadRuntime({ env: { AUTH_PROFILE_READ_RUNTIME: "POSTGRESQL" } }),
    "postgres"
  );
  assert.throws(
    () => resolveAuthProfileReadRuntime({ runtime: "mysql" }),
    /Unsupported AUTH_PROFILE_READ_RUNTIME/
  );
  assert.throws(
    () => createAuthProfileReadRepository({ env: {}, sqliteReaders: {} }),
    /sqliteReaders.getByFirebaseUid is required/
  );
  assert.throws(
    () => createAuthProfileReadRepository({ runtime: "postgres" }),
    /DATABASE_URL is required/
  );
}

function createFakePostgresDatabase(calls) {
  return {
    kind: "postgres",
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("FROM user_roles") && sql.includes("user_id = ANY")) {
        return { rows: [
          { user_id: "user-admin-pg", role: "admin" },
          { user_id: "user-merchant-pg", role: "merchant" },
        ] };
      }
      if (sql.includes("FROM merchant_users")) {
        return { rows: [{
          user_id: "user-merchant-pg",
          id: "store-pg",
          name: "PostgreSQL 測試店",
          merchant_id: "merchant-pg",
        }] };
      }
      if (sql.includes("SELECT DISTINCT")) {
        return { rows: [
          postgresUserRow({
            id: "user-admin-pg",
            login_name: "adminpg",
            display_name: "Admin PG",
          }),
          postgresUserRow(),
        ] };
      }
      if (sql.includes("FROM users")) {
        return { rows: [postgresUserRow()] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function postgresUserRow(overrides = {}) {
  return {
    id: "user-merchant-pg",
    login_name: "merchantpg",
    phone_number: "0922333444",
    email: "private-merchant@example.com",
    password_hash: "hash",
    display_name: "PostgreSQL 商家",
    ...overrides,
  };
}

function expectedMerchantProfile() {
  return {
    id: "user-merchant-pg",
    loginName: "merchantpg",
    phoneNumber: "0922333444",
    email: "private-merchant@example.com",
    passwordHash: "hash",
    displayName: "PostgreSQL 商家",
    surname: null,
    roles: ["merchant"],
    merchantStores: [{
      id: "store-pg",
      name: "PostgreSQL 測試店",
      merchantId: "merchant-pg",
      permissionLevel: null,
    }],
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
