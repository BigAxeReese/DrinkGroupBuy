"use strict";

// Required only for its side effect: backend/auth.js loads root .env and backend/.env into
// process.env at require time, which is how DATABASE_URL/FIREBASE_* reach this standalone script.
require("../backend/auth");

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const { getFirebaseAuth } = require("../backend/firebaseAuth");

// Replaces the old scripts/map-firebase-user.js, which only ever touched the local SQLite file
// and has done nothing on this project's permanent PostgreSQL runtime for a while (see AGENTS.md
// / PROGRESS.md's "known gap" note). Unlike a normal self-service signup, this creates the
// Firebase account pre-verified via the Admin SDK -- deliberately skipping the "click the link in
// your inbox" step, which only makes sense here because the email is a known, developer-chosen
// test fixture (a .test-domain address is fine), not something an untrusted person typed in.
const SEED_TARGETS = {
  customer: "user-customer-yinji",
  "customer-a": "user-customer-yinji",
  "customer-b": "user-customer-bolun",
  merchant: "user-merchant-001",
  admin: "user-admin-001"
};

async function main() {
  const target = process.argv[2];
  const email = getArgValue("--email");
  const password = getArgValue("--password");
  const isHelpRequest = target === "--help" || target === "-h";

  if (isHelpRequest || !target || !email || !password) {
    printUsage();
    process.exit(isHelpRequest ? 0 : 1);
  }

  const userId = SEED_TARGETS[target] || target;
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    const userResult = await database.query(
      "SELECT id, display_name, email, firebase_uid, status FROM users WHERE id = $1",
      [userId]
    );
    const seedUser = userResult.rows[0];
    if (!seedUser) throw new Error(`找不到這個種子帳號：${userId}`);
    if (seedUser.status !== "active") throw new Error(`這個帳號目前不是啟用狀態：${userId}`);

    const firebaseAuth = getFirebaseAuth();
    const firebaseUser = await upsertFirebaseUser(firebaseAuth, { email, password, displayName: seedUser.display_name });
    const now = new Date().toISOString();

    await database.transaction(async (transaction) => {
      // A firebase_uid can only ever be bound to one users row -- clear it from anywhere else
      // first (this seed data has previously carried a stale binding from earlier manual testing,
      // see PROGRESS.md 2026-09-11).
      await transaction.query(
        "UPDATE users SET firebase_uid = NULL WHERE firebase_uid = $1 AND id != $2",
        [firebaseUser.uid, userId]
      );
      await transaction.query(
        "UPDATE users SET firebase_uid = $1, email = $2, updated_at = $3 WHERE id = $4",
        [firebaseUser.uid, email, now, userId]
      );
      // Same audit_logs pattern as grant-admin-role.js -- this rebinds who can log in as an
      // existing identity, so it needs the same "who did this, when, what changed" trail as any
      // other identity mutation in this codebase (see adminAccountRoleRepository.js's insertAudit).
      await transaction.query(`
        INSERT INTO audit_logs (id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at)
        VALUES ($1, NULL, 'seed_account_firebase_rebind', 'user', $2, $3::jsonb, $4)
      `, [
        `audit-log-${randomUUID()}`,
        userId,
        JSON.stringify({
          previousEmail: seedUser.email,
          previousFirebaseUid: seedUser.firebase_uid,
          newEmail: email,
          newFirebaseUid: firebaseUser.uid,
          operator: "scripts/bind-seed-firebase-account.js"
        }),
        now
      ]);
    });

    const rolesResult = await database.query(
      "SELECT role FROM user_roles WHERE user_id = $1 AND status = 'active' ORDER BY role",
      [userId]
    );
    const roles = rolesResult.rows.map((row) => row.role).join(", ") || "(無)";
    console.log(`已將 ${userId}（${seedUser.display_name}）綁定到 Firebase 帳號 ${email}（UID ${firebaseUser.uid}）`);
    console.log(`角色：${roles}`);
    console.log(`這個帳號現在可以直接用信箱 ${email} ＋剛剛設定的密碼，透過信箱密碼登入頁登入。`);
  } finally {
    await database.close();
  }
}

async function upsertFirebaseUser(firebaseAuth, { email, password, displayName }) {
  try {
    const existing = await firebaseAuth.getUserByEmail(email);
    return await firebaseAuth.updateUser(existing.uid, { password, emailVerified: true });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    return await firebaseAuth.createUser({ email, password, emailVerified: true, displayName });
  }
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function printUsage() {
  console.log(`用法：
  node scripts/bind-seed-firebase-account.js customer --email=<email> --password=<password>
  node scripts/bind-seed-firebase-account.js customer-b --email=<email> --password=<password>
  node scripts/bind-seed-firebase-account.js merchant --email=<email> --password=<password>
  node scripts/bind-seed-firebase-account.js admin --email=<email> --password=<password>

透過 Firebase Admin SDK 直接建立（或更新）指定信箱的帳號，並直接標記為「信箱已驗證」，
不需要真的收信點連結——只適合綁定這種內部已知的測試身份，不是給一般使用者自助註冊用的。

目標名稱：
  customer / customer-a  -> user-customer-yinji
  customer-b             -> user-customer-bolun
  merchant               -> user-merchant-001
  admin                  -> user-admin-001
  （或直接填完整的 user id）`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
