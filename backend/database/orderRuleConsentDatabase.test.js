"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

test("SQLite keeps one append-only consent snapshot per order and rule version", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-consent-"));
  const databasePath = path.join(temporaryDirectory, "consent.sqlite");
  const previousDatabasePath = process.env.DRINK_GROUP_BUY_DB_PATH;
  let setupDatabase = null;

  try {
    setupDatabase = new DatabaseSync(databasePath);
    setupDatabase.exec(fs.readFileSync(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8"));
    setupDatabase.prepare(`
      INSERT INTO users (id, display_name, email, created_at, updated_at)
      VALUES ('customer-consent-test', 'Consent Test', 'consent@example.test', ?, ?)
    `).run("2026-08-15T00:00:00.000Z", "2026-08-15T00:00:00.000Z");
    setupDatabase.prepare(`
      INSERT INTO merchants (id, name, created_at, updated_at)
      VALUES ('merchant-consent-test', 'Consent Merchant', ?, ?)
    `).run("2026-08-15T00:00:00.000Z", "2026-08-15T00:00:00.000Z");
    setupDatabase.prepare(`
      INSERT INTO stores (
        id, merchant_id, name, address, phone, business_status,
        latitude, longitude, created_at, updated_at
      ) VALUES (
        'store-consent-test', 'merchant-consent-test', 'Consent Store', 'Test Address', '0000',
        'open', 24.1, 120.6, ?, ?
      )
    `).run("2026-08-15T00:00:00.000Z", "2026-08-15T00:00:00.000Z");
    setupDatabase.prepare(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status, maximum_cups,
        start_at, deadline_at, pickup_start_at, pickup_end_at, created_at, updated_at
      ) VALUES (
        'activity-consent-test', 'store-consent-test', 'customer-consent-test',
        'Consent Activity', 'recruiting', 10, ?, ?, ?, ?, ?, ?
      )
    `).run(
      "2026-08-15T00:00:00.000Z",
      "2026-08-15T01:00:00.000Z",
      "2026-08-15T02:00:00.000Z",
      "2026-08-15T03:00:00.000Z",
      "2026-08-15T00:00:00.000Z",
      "2026-08-15T00:00:00.000Z"
    );
    setupDatabase.prepare(`
      INSERT INTO orders (
        id, activity_id, customer_user_id, total_cups, original_amount,
        submitted_at, updated_at
      ) VALUES ('order-consent-test', 'activity-consent-test', 'customer-consent-test', 1, 70, ?, ?)
    `).run("2026-08-15T00:00:00.000Z", "2026-08-15T00:00:00.000Z");
    setupDatabase.close();
    setupDatabase = null;

    process.env.DRINK_GROUP_BUY_DB_PATH = databasePath;
    delete require.cache[require.resolve("../db")];
    const { recordOrderRuleConsentInDatabase } = require("../db");
    const first = recordOrderRuleConsentInDatabase(createConsent("2026-08-15T00:01:00.000Z"));
    const duplicate = recordOrderRuleConsentInDatabase(createConsent("2026-08-15T00:02:00.000Z"));

    assert.ok(first.id);
    assert.equal(duplicate.id, first.id);
    assert.equal(duplicate.consentedAt, "2026-08-15T00:01:00.000Z");

    const verificationDatabase = new DatabaseSync(databasePath, { readOnly: true });
    const count = verificationDatabase.prepare("SELECT COUNT(*) AS count FROM order_rule_consents").get();
    const integrity = verificationDatabase.prepare("PRAGMA integrity_check").get();
    const foreignKeyViolations = verificationDatabase.prepare("PRAGMA foreign_key_check").all();
    verificationDatabase.close();
    assert.equal(count.count, 1);
    assert.equal(integrity.integrity_check, "ok");
    assert.deepEqual(foreignKeyViolations, []);
  } finally {
    setupDatabase?.close();
    delete require.cache[require.resolve("../db")];
    restoreEnv("DRINK_GROUP_BUY_DB_PATH", previousDatabasePath);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

function createConsent(consentedAt) {
  return {
    orderId: "order-consent-test",
    customerUserId: "customer-consent-test",
    ruleType: "pickup_overdue",
    ruleVersion: "v1.0",
    ruleContentSnapshot: "authoritative rule snapshot",
    consentedAt
  };
}

function restoreEnv(name, value) {
  if (value == null) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
