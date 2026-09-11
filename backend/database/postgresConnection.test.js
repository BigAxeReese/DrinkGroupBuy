"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresConnectionOptions } = require("./postgresConnection");

test("PostgreSQL connection does not enable TLS for a local default", () => {
  const options = createPostgresConnectionOptions({
    env: { DATABASE_URL: "postgresql://localhost/drink_group_buy" },
  });

  assert.deepEqual(options, {
    connectionString: "postgresql://localhost/drink_group_buy",
  });
});

test("PostgreSQL TLS verifies the server certificate by default", () => {
  const options = createPostgresConnectionOptions({
    env: {
      DATABASE_URL: "postgresql://example.postgres.database.azure.com/postgres",
      DATABASE_SSL: "true",
    },
  });

  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
});

test("PostgreSQL certificate verification can only be disabled explicitly", () => {
  const options = createPostgresConnectionOptions({
    env: {
      DATABASE_URL: "postgresql://localhost/drink_group_buy",
      DATABASE_SSL: "true",
      DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
    },
  });

  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
});

test("PostgreSQL connection requires DATABASE_URL", () => {
  assert.throws(
    () => createPostgresConnectionOptions({ env: {} }),
    /DATABASE_URL is required/
  );
});
