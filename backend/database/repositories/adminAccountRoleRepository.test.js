"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminAccountRoleRepository } = require("./adminAccountRoleRepository");

function normalizedSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createFakeDatabase(options = {}) {
  const queries = [];
  const transactionQueries = [];
  const database = {
    async query(sql, parameters = []) {
      const statement = normalizedSql(sql);
      queries.push({ statement, parameters });
      return { rows: options.listRows || [] };
    },
    async transaction(operation) {
      const transaction = {
        async query(sql, parameters = []) {
          const statement = normalizedSql(sql);
          transactionQueries.push({ statement, parameters });

          if (statement.startsWith("SELECT id, status FROM users")) {
            return { rows: options.userRows ?? [{ id: "user-1", status: "active" }] };
          }
          if (statement.startsWith("SELECT role, status FROM user_roles")) {
            return { rows: options.roleRows || [] };
          }
          if (statement.includes("FROM merchant_users merchant_user")) {
            return { rows: options.merchantRows || [] };
          }
          return { rows: [] };
        },
      };
      return operation(transaction);
    },
  };
  return { database, queries, transactionQueries };
}

function findTransactionQuery(fake, prefix) {
  return fake.transactionQueries.find((item) => item.statement.startsWith(prefix));
}

test("admin account list uses a bound search and includes protected or inactive identities", async () => {
  const fake = createFakeDatabase({
    listRows: [
      {
        id: "user-1",
        email: "person@example.com",
        display_name: "測試帳號",
        status: "active",
        active_roles: ["customer"],
        merchant_user_id: null,
        merchant_user_status: null,
        store_id: null,
        store_name: null,
        merchant_status: null,
      },
      {
        id: "admin-1",
        email: "admin@example.com",
        display_name: "管理員",
        status: "active",
        active_roles: ["admin"],
        merchant_user_id: null,
        merchant_user_status: null,
        store_id: null,
        store_name: null,
        merchant_status: null,
      },
      {
        id: "deleted-1",
        email: "deleted@example.com",
        display_name: "已刪除帳號",
        status: "deleted",
        active_roles: [],
        merchant_user_id: null,
        merchant_user_status: null,
        store_id: null,
        store_name: null,
        merchant_status: null,
      },
    ],
  });
  const repository = createAdminAccountRoleRepository({ database: fake.database });

  const accounts = await repository.listAccounts({ search: " person " });

  assert.equal(fake.queries.length, 1);
  assert.deepEqual(fake.queries[0].parameters, ["person"]);
  assert.doesNotMatch(fake.queries[0].statement, /NOT EXISTS/);
  assert.doesNotMatch(fake.queries[0].statement, /user_account\.status != 'deleted'/);
  assert.deepEqual(accounts[0], {
    id: "user-1",
    email: "person@example.com",
    displayName: "測試帳號",
    status: "active",
    activeRole: "customer",
    activeRoles: ["customer"],
    protectedAdmin: false,
    merchantProfileAvailable: false,
    merchantUserStatus: null,
    merchantStore: null,
  });
  assert.equal(accounts[1].activeRole, "admin");
  assert.equal(accounts[1].protectedAdmin, true);
  assert.equal(accounts[2].status, "deleted");
  assert.equal(accounts[2].protectedAdmin, false);
});

test("customer can switch to a linked merchant without deleting customer data", async () => {
  const fake = createFakeDatabase({
    roleRows: [
      { role: "customer", status: "active" },
      { role: "merchant", status: "disabled" },
    ],
    merchantRows: [{
      id: "merchant-user-1",
      status: "disabled",
      store_id: "store-1",
      store_name: "測試店",
      merchant_status: "active",
    }],
  });
  const repository = createAdminAccountRoleRepository({ database: fake.database });

  const result = await repository.setActiveRole({
    actorUserId: "admin-1",
    userId: "user-1",
    targetRole: "merchant",
    now: "2026-09-11T04:00:00.000Z",
  });

  assert.deepEqual(result, {
    userId: "user-1",
    activeRole: "merchant",
    changed: true,
    merchantStore: { id: "store-1", name: "測試店" },
  });
  assert.equal(fake.transactionQueries.some((item) => /\bDELETE\b/i.test(item.statement)), false);
  assert.deepEqual(
    findTransactionQuery(fake, "INSERT INTO user_roles").parameters.slice(1, 3),
    ["user-1", "merchant"]
  );
  assert.deepEqual(
    findTransactionQuery(fake, "UPDATE user_roles").parameters,
    ["user-1", "customer"]
  );
  assert.deepEqual(
    findTransactionQuery(fake, "UPDATE merchant_users").parameters,
    ["active", "merchant-user-1"]
  );
  const audit = findTransactionQuery(fake, "INSERT INTO audit_logs");
  assert.equal(audit.parameters[1], "admin-1");
  assert.deepEqual(JSON.parse(audit.parameters[3]), {
    previousActiveRoles: ["customer"],
    targetRole: "merchant",
    merchantUserStatusBefore: "disabled",
  });
});

test("merchant can switch back to customer while preserving the merchant link", async () => {
  const fake = createFakeDatabase({
    roleRows: [
      { role: "customer", status: "disabled" },
      { role: "merchant", status: "active" },
    ],
    merchantRows: [{
      id: "merchant-user-1",
      status: "active",
      store_id: "store-1",
      store_name: "測試店",
      merchant_status: "active",
    }],
  });
  const repository = createAdminAccountRoleRepository({ database: fake.database });

  const result = await repository.setActiveRole({
    actorUserId: "admin-1",
    userId: "user-1",
    targetRole: "customer",
  });

  assert.equal(result.activeRole, "customer");
  assert.equal(result.changed, true);
  assert.equal(fake.transactionQueries.some((item) => /\bDELETE\b/i.test(item.statement)), false);
  assert.deepEqual(
    findTransactionQuery(fake, "UPDATE user_roles").parameters,
    ["user-1", "merchant"]
  );
  assert.deepEqual(
    findTransactionQuery(fake, "UPDATE merchant_users").parameters,
    ["disabled", "merchant-user-1"]
  );
});

test("plain customer cannot become a merchant before merchant approval creates a store link", async () => {
  const fake = createFakeDatabase({
    roleRows: [{ role: "customer", status: "active" }],
    merchantRows: [],
  });
  const repository = createAdminAccountRoleRepository({ database: fake.database });

  const result = await repository.setActiveRole({
    actorUserId: "admin-1",
    userId: "user-1",
    targetRole: "merchant",
  });

  assert.deepEqual(result, { error: "merchant_profile_required" });
  assert.equal(fake.transactionQueries.length, 3);
});

test("admin account cannot be converted through customer merchant role management", async () => {
  const fake = createFakeDatabase({
    roleRows: [{ role: "admin", status: "active" }],
  });
  const repository = createAdminAccountRoleRepository({ database: fake.database });

  const result = await repository.setActiveRole({
    actorUserId: "admin-1",
    userId: "admin-1",
    targetRole: "customer",
  });

  assert.deepEqual(result, { error: "admin_account_protected" });
  assert.equal(fake.transactionQueries.length, 2);
});

test("repeating the already-active role is a no-op without another audit record", async () => {
  const fake = createFakeDatabase({
    roleRows: [
      { role: "customer", status: "disabled" },
      { role: "merchant", status: "active" },
    ],
    merchantRows: [{
      id: "merchant-user-1",
      status: "active",
      store_id: "store-1",
      store_name: "測試店",
      merchant_status: "active",
    }],
  });
  const repository = createAdminAccountRoleRepository({ database: fake.database });

  const result = await repository.setActiveRole({
    actorUserId: "admin-1",
    userId: "user-1",
    targetRole: "merchant",
  });

  assert.equal(result.changed, false);
  assert.equal(fake.transactionQueries.length, 3);
});
