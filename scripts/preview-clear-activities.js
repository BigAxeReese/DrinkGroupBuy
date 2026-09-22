"use strict";

// READ-ONLY preview of what `TRUNCATE TABLE group_buy_activities CASCADE` would delete. Run it BEFORE
// applying migration 008 (database/migrations/008_percentage_discount_postgres.sql refuses to run while
// any activity data exists). It changes nothing: one READ ONLY transaction that is always rolled back,
// and it never prints the connection string, user name or password.
//
// Usage: DATABASE_URL=postgres://... node scripts/preview-clear-activities.js
// A remote database (Azure) also needs DATABASE_SSL=true and DATABASE_SSL_REJECT_UNAUTHORIZED=true,
// exactly like database/migrate.js.

const { Client } = require("pg");
const { createPostgresConnectionOptions } = require("../backend/database/postgresConnection");

async function main() {
  const options = createPostgresConnectionOptions();
  console.log(describeTarget(options.connectionString));

  const client = new Client(options);
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const migrations = await readAppliedMigrations(client);
    const affected = await readRowsThatWouldBeCleared(client);
    const unsettled = await readUnsettledAuthorizations(client);
    const kept = await readKeptTablesWithHistory(client);
    printReport({ migrations, affected, unsettled, kept });
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

function describeTarget(connectionString) {
  try {
    const url = new URL(connectionString);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return `目標資料庫：主機 ${url.hostname}（${local ? "本機" : "遠端，請確認這是你要檢查的環境"}），資料庫 ${url.pathname.replace(/^\//, "")}`;
  } catch (_) {
    return "目標資料庫：無法解析 DATABASE_URL（不顯示內容）";
  }
}

async function readAppliedMigrations(client) {
  const exists = await client.query("SELECT to_regclass('schema_migrations') AS name");
  if (exists.rows[0].name === null) return [];
  const result = await client.query("SELECT version FROM schema_migrations ORDER BY version");
  return result.rows.map((row) => row.version);
}

// Postgres empties every table that has a foreign key pointing at the truncated one, and every table
// pointing at those. Follow the same foreign keys, then count the rows of each table found.
async function readRowsThatWouldBeCleared(client) {
  const result = await client.query(`
    WITH RECURSIVE deps(oid) AS (
      SELECT 'group_buy_activities'::regclass::oid
      UNION
      SELECT con.conrelid FROM pg_constraint con JOIN deps d ON con.confrelid = d.oid WHERE con.contype = 'f'
    ),
    affected AS (
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM deps d
      JOIN pg_class c ON c.oid = d.oid
      JOIN pg_namespace n ON n.oid = c.relnamespace
    )
    SELECT table_name,
           (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schema_name, table_name), false, true, '')))[1]::text::int AS row_count
    FROM affected
    ORDER BY table_name`);
  return result.rows;
}

// Authorizations that were neither captured nor voided may still hold a credit-limit reservation at
// LINE Pay; clearing the table forgets them without releasing anything.
async function readUnsettledAuthorizations(client) {
  const result = await client.query(
    "SELECT status, count(*)::int AS n FROM payment_authorizations WHERE status IN ('pending', 'authorized') GROUP BY status ORDER BY status"
  );
  return result.rows;
}

// These tables are NOT emptied (no foreign key ties them to activities) but may hold history that
// mentions orders which are about to disappear.
async function readKeptTablesWithHistory(client) {
  const result = await client.query(`
    SELECT 'audit_logs' AS table_name, count(*)::int AS n FROM audit_logs
    UNION ALL SELECT 'payment_provider_events', count(*)::int FROM payment_provider_events
    UNION ALL SELECT 'payment_reliability_jobs', count(*)::int FROM payment_reliability_jobs
    UNION ALL SELECT 'status_history', count(*)::int FROM status_history
    ORDER BY table_name`);
  return result.rows;
}

function printReport({ migrations, affected, unsettled, kept }) {
  const totalRows = affected.reduce((sum, row) => sum + row.row_count, 0);
  const has008 = migrations.includes("008");

  console.log(`已套用的 migration：${migrations.length ? migrations.join("、") : "（沒有）"}${has008 ? "（008 已套用）" : "（008 尚未套用）"}`);
  console.log(`\n--- 執行 TRUNCATE TABLE group_buy_activities CASCADE 會清空 ${affected.length} 張表，共 ${totalRows} 筆 ---`);
  for (const row of affected) console.log(`  ${row.table_name.padEnd(36)} ${row.row_count}`);

  console.log("\n--- 需要留意 ---");
  if (unsettled.length === 0) console.log("  沒有「已授權但還沒請款也沒取消」的付款授權。");
  for (const row of unsettled) console.log(`  付款授權 ${row.status}：${row.n} 筆（清空後系統會忘記它們；LINE Pay 端可能仍保留額度）`);
  console.log("  不會被清空、但可能記著即將消失的訂單的紀錄（筆數）：");
  for (const row of kept) console.log(`    ${row.table_name.padEnd(30)} ${row.n}`);

  console.log("\n--- 結論 ---");
  if (has008) console.log("  008 已經套用，不需要清空。");
  else if (totalRows === 0) console.log("  沒有團購相關資料，可以直接套用 008：npm run postgres:migrate");
  else console.log(`  有 ${totalRows} 筆資料。套用 008 前必須先清空（刪除後無法復原，請先備份）。`);
  console.log("\n這個指令沒有修改任何資料。");
}

main().catch((error) => {
  console.error("檢查失敗：" + String(error.message).split("\n")[0]);
  process.exitCode = 1;
});
