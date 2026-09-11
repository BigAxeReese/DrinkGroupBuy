"use strict";

function createPostgresConnectionOptions(input = {}) {
  const env = input.env || process.env;
  const connectionString = input.connectionString || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const options = { connectionString };
  if (!readBoolean(env.DATABASE_SSL, false)) {
    return options;
  }

  options.ssl = {
    rejectUnauthorized: readBoolean(env.DATABASE_SSL_REJECT_UNAUTHORIZED, true),
  };
  return options;
}

function readBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

module.exports = { createPostgresConnectionOptions };
