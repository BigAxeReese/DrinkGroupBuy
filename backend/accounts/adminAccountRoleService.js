"use strict";

const { PaymentServiceError } = require("../payments/linePayService");

const ALLOWED_ACCOUNT_ROLES = new Set(["customer", "merchant"]);

async function listAdminAccounts({ authUser, search, adminAccountRoleRepository } = {}) {
  requireAdmin(authUser);
  return adminAccountRoleRepository.listAccounts({
    search: typeof search === "string" ? search.trim().slice(0, 100) : "",
  });
}

async function setAdminAccountRole({
  authUser,
  userId,
  body,
  adminAccountRoleRepository,
  now,
} = {}) {
  requireAdmin(authUser);

  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) {
    throw new PaymentServiceError(400, { error: "userId is required" });
  }

  const targetRole = typeof body?.targetRole === "string" ? body.targetRole.trim() : "";
  if (!ALLOWED_ACCOUNT_ROLES.has(targetRole)) {
    throw new PaymentServiceError(400, { error: "targetRole must be customer or merchant" });
  }

  const result = await adminAccountRoleRepository.setActiveRole({
    actorUserId: authUser.id,
    userId: normalizedUserId,
    targetRole,
    now,
  });
  if (result.error) {
    throw new PaymentServiceError(accountRoleErrorStatus(result.error), {
      error: accountRoleErrorMessage(result.error),
      status: result.error,
    });
  }
  return result;
}

function requireAdmin(authUser) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }
}

function accountRoleErrorStatus(error) {
  const statusCodes = {
    account_not_found: 404,
    account_disabled: 409,
    admin_account_protected: 403,
    merchant_profile_required: 409,
    merchant_profile_disabled: 409,
  };
  return statusCodes[error] || 400;
}

function accountRoleErrorMessage(error) {
  const messages = {
    account_not_found: "Account not found",
    account_disabled: "Disabled account role cannot be changed",
    admin_account_protected: "Admin account role cannot be changed here",
    merchant_profile_required: "Merchant application must be approved before activating merchant role",
    merchant_profile_disabled: "Merchant profile is disabled",
  };
  return messages[error] || "Account role change failed";
}

module.exports = {
  listAdminAccounts,
  setAdminAccountRole,
};
