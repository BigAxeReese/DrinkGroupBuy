const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const backupDirectory = path.join(__dirname, "..", "database", "backups");
const shouldApply = process.argv.includes("--apply");
const shouldVacuum = process.argv.includes("--vacuum");

if (!fs.existsSync(databasePath)) {
  throw new Error(`Development database not found: ${databasePath}`);
}

const preview = inspectDuplicateGroups();
printPreview(preview);

if (!shouldApply) {
  console.log("Preview only. Run with --apply to create a backup and compact these rows.");
  process.exit(0);
}

if (preview.removableRows === 0) {
  console.log("No duplicate terminal payment failures require cleanup.");
  process.exit(0);
}

fs.mkdirSync(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(
  backupDirectory,
  `drink-group-buy-dev-before-capture-cleanup-${timestamp}.sqlite`
);
fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);

const cleanup = compactDuplicateGroups();
if (shouldVacuum) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("VACUUM;");
  } finally {
    database.close();
  }
}

const after = inspectDuplicateGroups();
console.log(JSON.stringify({
  backupPath,
  removedRows: cleanup.removedRows,
  auditRowsCreated: cleanup.auditRowsCreated,
  remainingDuplicateGroups: after.groups.length,
  remainingRemovableRows: after.removableRows,
  vacuumed: shouldVacuum
}, null, 2));

function inspectDuplicateGroups() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const groups = findDuplicateGroups(database);
    return {
      groups,
      duplicateRows: groups.reduce((sum, group) => sum + group.row_count, 0),
      removableRows: groups.reduce((sum, group) => sum + group.row_count - 1, 0)
    };
  } finally {
    database.close();
  }
}

function findDuplicateGroups(database) {
  return database.prepare(`
    SELECT
      order_id,
      payment_authorization_id,
      failure_reason,
      COUNT(*) AS row_count,
      MIN(created_at) AS first_created_at,
      MAX(created_at) AS last_created_at
    FROM payment_captures
    WHERE status = 'failed'
      AND retryable = 0
    GROUP BY order_id, payment_authorization_id, failure_reason
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC, payment_authorization_id ASC
  `).all();
}

function compactDuplicateGroups() {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  let transactionStarted = false;
  let removedRows = 0;
  let auditRowsCreated = 0;

  try {
    database.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;

    for (const group of findDuplicateGroups(database)) {
      const rows = database.prepare(`
        SELECT id, created_at
        FROM payment_captures
        WHERE order_id = ?
          AND payment_authorization_id = ?
          AND status = 'failed'
          AND retryable = 0
          AND failure_reason IS ?
        ORDER BY created_at DESC, id DESC
      `).all(group.order_id, group.payment_authorization_id, group.failure_reason);

      if (rows.length <= 1) continue;

      const retained = rows[0];
      const removal = database.prepare(`
        DELETE FROM payment_captures
        WHERE order_id = ?
          AND payment_authorization_id = ?
          AND status = 'failed'
          AND retryable = 0
          AND failure_reason IS ?
          AND id <> ?
      `).run(
        group.order_id,
        group.payment_authorization_id,
        group.failure_reason,
        retained.id
      );

      if (removal.changes !== rows.length - 1) {
        throw new Error(
          `Cleanup count mismatch for authorization ${group.payment_authorization_id}: `
          + `expected ${rows.length - 1}, removed ${removal.changes}`
        );
      }

      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO audit_logs (
          id,
          actor_user_id,
          action_type,
          resource_type,
          resource_id,
          metadata_json,
          created_at
        ) VALUES (?, NULL, 'payment_capture_duplicates_compacted', 'payment_authorization', ?, ?, ?)
      `).run(
        `audit-${randomUUID()}`,
        group.payment_authorization_id,
        JSON.stringify({
          cleanupVersion: 1,
          orderId: group.order_id,
          failureReason: group.failure_reason,
          originalRowCount: rows.length,
          removedRowCount: removal.changes,
          retainedCaptureId: retained.id,
          firstCreatedAt: group.first_created_at,
          lastCreatedAt: group.last_created_at
        }),
        now
      );

      removedRows += removal.changes;
      auditRowsCreated += 1;
    }

    database.exec("COMMIT;");
    transactionStarted = false;
    return { removedRows, auditRowsCreated };
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
}

function printPreview(preview) {
  console.log(JSON.stringify({
    mode: shouldApply ? "apply" : "preview",
    duplicateGroups: preview.groups.length,
    duplicateRows: preview.duplicateRows,
    removableRows: preview.removableRows,
    groups: preview.groups.map((group) => ({
      orderId: group.order_id,
      paymentAuthorizationId: group.payment_authorization_id,
      failureReason: group.failure_reason,
      rowCount: group.row_count,
      firstCreatedAt: group.first_created_at,
      lastCreatedAt: group.last_created_at
    }))
  }, null, 2));
}
