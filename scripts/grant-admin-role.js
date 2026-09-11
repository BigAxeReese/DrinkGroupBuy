"use strict";

// Required only for its side effect: backend/auth.js loads root .env and backend/.env into
// process.env at require time, which is how DATABASE_URL/FIREBASE_* reach this standalone script.
require("../backend/auth");

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const { getFirebaseAuth } = require("../backend/firebaseAuth");

// Deliberately NOT reachable from any web UI -- granting the admin role is the one thing
// /admin/accounts's self-service role switch refuses to do (see backend/accounts/
// adminAccountRoleService.js's ALLOWED_ACCOUNT_ROLES), so this stays a script an operator runs
// by hand. Grant requires the target's Firebase email to already be verified, so the operator
// isn't taking a typed-in, unconfirmed address on faith; revoke has no such requirement since
// removing access carries no equivalent risk.
async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((arg) => !arg.startsWith("--"));

  if (!email || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(email ? 0 : 1);
  }

  if (!revoke) {
    await requireVerifiedFirebaseEmail(email);
  }

  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    const now = new Date().toISOString();
    const result = await database.transaction(async (transaction) => {
      const userResult = await transaction.query(
        "SELECT id, display_name, status FROM users WHERE email = $1 FOR UPDATE",
        [email]
      );
      const user = userResult.rows[0];
      if (!user) return { error: "user_not_found" };
      if (user.status !== "active") return { error: "account_disabled" };

      if (revoke) {
        await transaction.query(
          "UPDATE user_roles SET status = 'disabled' WHERE user_id = $1 AND role = 'admin'",
          [user.id]
        );
      } else {
        await transaction.query(`
          INSERT INTO user_roles (id, user_id, role, status, granted_at)
          VALUES ($1, $2, 'admin', 'active', $3)
          ON CONFLICT (user_id, role) DO UPDATE SET status = 'active'
        `, [`user-role-${randomUUID()}`, user.id, now]);
      }

      await transaction.query(`
        INSERT INTO audit_logs (id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at)
        VALUES ($1, NULL, $2, 'user', $3, $4::jsonb, $5)
      `, [
        `audit-log-${randomUUID()}`,
        revoke ? "admin_role_revoked_via_script" : "admin_role_granted_via_script",
        user.id,
        JSON.stringify({ email, operator: "scripts/grant-admin-role.js" }),
        now
      ]);

      return { userId: user.id, displayName: user.display_name };
    });

    if (result.error === "user_not_found") {
      throw new Error(
        `找不到 email 為 ${email} 的帳號。請先請這個人到 /admin/login 用「用信箱登入」的「建立帳號」建立身份，才能被授予管理員權限。`
      );
    }
    if (result.error === "account_disabled") {
      throw new Error(`這個帳號目前是停用狀態，無法${revoke ? "撤銷" : "授予"}管理員權限。`);
    }

    console.log(`${revoke ? "已撤銷" : "已授予"} ${result.displayName}（${email}, ${result.userId}）的管理員權限。`);
  } finally {
    await database.close();
  }
}

async function requireVerifiedFirebaseEmail(email) {
  let firebaseUser;
  try {
    firebaseUser = await getFirebaseAuth().getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new Error(
        `這個 email 在 Firebase 裡找不到對應帳號，請先讓這個人到 /admin/login 用「用信箱登入」的「建立帳號」建立身份。`
      );
    }
    throw new Error(`查詢 Firebase 帳號失敗：${error.message}`);
  }
  if (!firebaseUser.emailVerified) {
    throw new Error("這個信箱在 Firebase 還沒完成驗證，請對方先點擊驗證信裡的連結，再重新執行這支腳本。");
  }
}

function printUsage() {
  console.log(`用法：
  node scripts/grant-admin-role.js someone@example.com           授予管理員權限（要求 Firebase 信箱已驗證）
  node scripts/grant-admin-role.js someone@example.com --revoke  撤銷管理員權限

前提：這個 email 必須已經在 /admin/login 用「用信箱登入」的「建立帳號」建立過一次，
      資料庫 users.email 才會有對應的帳號可以授予角色。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
