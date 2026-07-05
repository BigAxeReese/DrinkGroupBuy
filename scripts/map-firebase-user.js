const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const targetUsers = {
  customer: "user-customer-yinji",
  "customer-a": "user-customer-yinji",
  "customer-b": "user-customer-bolun",
  merchant: "user-merchant-001",
  "merchant-store-001": "user-merchant-001",
  admin: "user-admin-001"
};

const target = process.argv[2];
const explicitUid = getArgValue("--uid") || process.env.FIREBASE_UID;

if (!target || target === "--help" || target === "-h") {
  printUsage();
  process.exit(target ? 0 : 1);
}

const targetUserId = targetUsers[target] || target;
const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const database = new DatabaseSync(databasePath);

try {
  const columns = database.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("firebase_uid")) {
    throw new Error("users.firebase_uid does not exist. Run the local firebase_uid migration first.");
  }

  const targetUser = database.prepare(`
    SELECT id, login_name, email, display_name
    FROM users
    WHERE id = ?
      AND status = 'active'
  `).get(targetUserId);
  if (!targetUser) {
    throw new Error(`Target user not found or inactive: ${targetUserId}`);
  }

  const firebaseUid = explicitUid || getExistingSingleFirebaseUid(database);
  if (!firebaseUid) {
    throw new Error("No Firebase UID found. Pass --uid=<firebase_uid> or set FIREBASE_UID.");
  }

  database.exec("BEGIN;");
  database.prepare("UPDATE users SET firebase_uid = NULL WHERE firebase_uid = ?").run(firebaseUid);
  database.prepare("UPDATE users SET firebase_uid = ? WHERE id = ?").run(firebaseUid, targetUserId);
  database.exec("COMMIT;");

  const roles = database.prepare(`
    SELECT role
    FROM user_roles
    WHERE user_id = ?
      AND status = 'active'
    ORDER BY role ASC
  `).all(targetUserId).map((row) => row.role);

  console.log(`Mapped Firebase UID ${firebaseUid} to ${targetUserId}`);
  console.log(`Display name: ${targetUser.display_name}`);
  console.log(`Roles: ${roles.join(", ") || "(none)"}`);
  console.log("Sign out and sign in again in the app to receive a fresh backend token.");
} catch (error) {
  try {
    database.exec("ROLLBACK;");
  } catch {
    // No active transaction.
  }
  console.error(error.message);
  process.exit(1);
} finally {
  database.close();
}

function getExistingSingleFirebaseUid(database) {
  const rows = database.prepare(`
    SELECT DISTINCT firebase_uid
    FROM users
    WHERE firebase_uid IS NOT NULL
      AND firebase_uid <> ''
  `).all();

  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error("Multiple Firebase UIDs are mapped. Pass --uid=<firebase_uid> explicitly.");
  }
  return rows[0].firebase_uid;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function printUsage() {
  console.log(`Usage:
  node scripts/map-firebase-user.js customer
  node scripts/map-firebase-user.js merchant
  node scripts/map-firebase-user.js admin
  node scripts/map-firebase-user.js user-merchant-001
  node scripts/map-firebase-user.js merchant --uid=<firebase_uid>

Targets:
  customer            -> user-customer-yinji
  customer-b          -> user-customer-bolun
  merchant            -> user-merchant-001
  admin               -> user-admin-001
`);
}
