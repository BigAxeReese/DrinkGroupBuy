"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCustomerRegistrationRepository } = require("./customerRegistrationRepository");

function normalizedSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createFakeDatabase(options = {}) {
  const queries = [];
  const transactionQueries = [];
  let firebaseLookupCount = 0;

  const database = {
    async query(sql, parameters = []) {
      const statement = normalizedSql(sql);
      queries.push({ statement, parameters });

      if (statement.startsWith("SELECT id, status FROM users WHERE firebase_uid = $1")) {
        firebaseLookupCount += 1;
        if (firebaseLookupCount === 1) return { rows: options.initialUsers || [] };
        return { rows: options.concurrentWinner ? [options.concurrentWinner] : [] };
      }

      throw new Error(`Unexpected database query: ${statement}`);
    },
    async transaction(operation) {
      if (options.transactionError) throw options.transactionError;

      const transaction = {
        async query(sql, parameters = []) {
          const statement = normalizedSql(sql);
          transactionQueries.push({ statement, parameters });
          return { rows: [] };
        },
      };
      return operation(transaction);
    },
  };

  return { database, queries, transactionQueries };
}

test("first verified Firebase login creates an active customer and audit record atomically", async () => {
  const fake = createFakeDatabase();
  const repository = createCustomerRegistrationRepository({ database: fake.database });
  const now = "2026-09-11T00:00:00.000Z";

  const result = await repository.resolveOrRegisterCustomer({
    firebaseUid: "firebase-customer-1",
    email: "customer@example.com",
    displayName: "測試顧客",
    now,
  });

  assert.equal(result.created, true);
  assert.match(result.userId, /^user-/);
  assert.equal(fake.transactionQueries.length, 3);

  const userInsert = fake.transactionQueries[0];
  assert.match(userInsert.statement, /INSERT INTO users/);
  assert.deepEqual(userInsert.parameters.slice(1), [
    "firebase-customer-1",
    "customer@example.com",
    "測試顧客",
    now,
  ]);

  const roleInsert = fake.transactionQueries[1];
  assert.match(roleInsert.statement, /INSERT INTO user_roles/);
  assert.equal(roleInsert.parameters[1], result.userId);

  const auditInsert = fake.transactionQueries[2];
  assert.match(auditInsert.statement, /INSERT INTO audit_logs/);
  assert.equal(auditInsert.parameters[1], result.userId);
  assert.equal(auditInsert.parameters[2], "customer_self_registered");
});

test("an existing active Firebase account is reused without writing", async () => {
  const fake = createFakeDatabase({ initialUsers: [{ id: "user-existing", status: "active" }] });
  const repository = createCustomerRegistrationRepository({ database: fake.database });

  const result = await repository.resolveOrRegisterCustomer({ firebaseUid: "firebase-existing" });

  assert.deepEqual(result, { userId: "user-existing", created: false });
  assert.equal(fake.transactionQueries.length, 0);
});

test("a disabled Firebase account cannot self-register again", async () => {
  const fake = createFakeDatabase({ initialUsers: [{ id: "user-disabled", status: "disabled" }] });
  const repository = createCustomerRegistrationRepository({ database: fake.database });

  const result = await repository.resolveOrRegisterCustomer({ firebaseUid: "firebase-disabled" });

  assert.deepEqual(result, { error: "account_disabled" });
  assert.equal(fake.transactionQueries.length, 0);
});

test("concurrent first login reuses the account that won the firebase UID constraint", async () => {
  const duplicateUidError = Object.assign(new Error("duplicate firebase uid"), {
    code: "23505",
    constraint: "users_firebase_uid_key",
  });
  const fake = createFakeDatabase({
    transactionError: duplicateUidError,
    concurrentWinner: { id: "user-winner", status: "active" },
  });
  const repository = createCustomerRegistrationRepository({ database: fake.database });

  const result = await repository.resolveOrRegisterCustomer({ firebaseUid: "firebase-race" });

  assert.deepEqual(result, { userId: "user-winner", created: false });
  assert.equal(fake.queries.length, 2);
});

test("an email owned by a different account fails closed", async () => {
  const duplicateEmailError = Object.assign(new Error("duplicate email"), {
    code: "23505",
    constraint: "users_email_key",
  });
  const fake = createFakeDatabase({ transactionError: duplicateEmailError });
  const repository = createCustomerRegistrationRepository({ database: fake.database });

  const result = await repository.resolveOrRegisterCustomer({
    firebaseUid: "firebase-new",
    email: "owned@example.com",
  });

  assert.deepEqual(result, { error: "email_already_registered" });
});
