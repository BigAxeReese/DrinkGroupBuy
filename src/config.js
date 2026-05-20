const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const envPath = resolve(__dirname, "..", ".env");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function intFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

module.exports = {
  port: intFromEnv("PORT", 8100),
  baseUrl: process.env.BASE_URL || "http://127.0.0.1:8100",
  databasePath: resolve(__dirname, "..", process.env.DATABASE_PATH || "./data/bgb.db"),
  payment: {
    provider: process.env.PAYMENT_PROVIDER || "mock",
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || "change-this-local-secret",
  },
};
