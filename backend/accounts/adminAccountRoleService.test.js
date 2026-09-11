"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listAdminAccounts,
  setAdminAccountRole,
} = require("./adminAccountRoleService");

function createRepository(result = {}) {
  const calls = [];
  return {
    calls,
    async listAccounts(input) {
      calls.push({ method: "listAccounts", input });
      return result.accounts || [];
    },
    async setActiveRole(input) {
      calls.push({ method: "setActiveRole", input });
      return result.roleChange || {};
    },
  };
}

test("non-admin cannot list or change account roles", async () => {
  const repository = createRepository();
  await assert.rejects(
    () => listAdminAccounts({
      authUser: { id: "customer-1", roles: ["customer"] },
      adminAccountRoleRepository: repository,
    }),
    (error) => error.statusCode === 403 && error.payload.error === "Admin role required"
  );
  await assert.rejects(
    () => setAdminAccountRole({
      authUser: { id: "merchant-1", roles: ["merchant"] },
      userId: "user-1",
      body: { targetRole: "customer" },
      adminAccountRoleRepository: repository,
    }),
    (error) => error.statusCode === 403 && error.payload.error === "Admin role required"
  );
  assert.equal(repository.calls.length, 0);
});

test("admin role change accepts only customer or merchant", async () => {
  const repository = createRepository();
  await assert.rejects(
    () => setAdminAccountRole({
      authUser: { id: "admin-1", roles: ["admin"] },
      userId: "user-1",
      body: { targetRole: "admin" },
      adminAccountRoleRepository: repository,
    }),
    (error) => error.statusCode === 400
      && error.payload.error === "targetRole must be customer or merchant"
  );
  assert.equal(repository.calls.length, 0);
});

test("admin identity and target role are passed to the repository", async () => {
  const repository = createRepository({
    roleChange: { userId: "user-1", activeRole: "merchant", changed: true },
  });
  const now = "2026-09-11T04:30:00.000Z";

  const result = await setAdminAccountRole({
    authUser: { id: "admin-1", roles: ["admin"] },
    userId: " user-1 ",
    body: { targetRole: "merchant" },
    adminAccountRoleRepository: repository,
    now,
  });

  assert.equal(result.activeRole, "merchant");
  assert.deepEqual(repository.calls[0], {
    method: "setActiveRole",
    input: {
      actorUserId: "admin-1",
      userId: "user-1",
      targetRole: "merchant",
      now,
    },
  });
});

test("missing merchant profile becomes a conflict instead of granting an unusable role", async () => {
  const repository = createRepository({
    roleChange: { error: "merchant_profile_required" },
  });

  await assert.rejects(
    () => setAdminAccountRole({
      authUser: { id: "admin-1", roles: ["admin"] },
      userId: "user-1",
      body: { targetRole: "merchant" },
      adminAccountRoleRepository: repository,
    }),
    (error) => error.statusCode === 409
      && error.payload.status === "merchant_profile_required"
  );
});

test("account search is trimmed and capped before reaching the database", async () => {
  const repository = createRepository({ accounts: [] });
  const longSearch = `  ${"a".repeat(120)}  `;

  await listAdminAccounts({
    authUser: { id: "admin-1", roles: ["admin"] },
    search: longSearch,
    adminAccountRoleRepository: repository,
  });

  assert.equal(repository.calls[0].input.search, "a".repeat(100));
});
