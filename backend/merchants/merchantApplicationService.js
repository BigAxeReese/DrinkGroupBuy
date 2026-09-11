"use strict";

// New domain module, not backend/payments/ -- this feature doesn't touch payment/LINE Pay code
// at all (see docs/AI-architecture.md's guidance to keep new complex rules in their own
// service/repository boundary rather than folding them into an unrelated domain).
const { verifyFirebaseIdToken } = require("../firebaseAuth");
// Reused purely for its {statusCode, payload} shape and because server.js's global catch-all
// already special-cases `instanceof PaymentServiceError` -- this class isn't actually
// payment-specific despite the name (see plan notes / PROGRESS.md for the naming tradeoff).
const { PaymentServiceError } = require("../payments/linePayService");

const MAX_STORE_NAME_LENGTH = 30;
const MAX_CONTACT_PHONE_LENGTH = 30;
const MAX_ADDRESS_LENGTH = 200;

async function submitMerchantApplication({ idToken, body, merchantApplicationRepository, now } = {}) {
  if (!idToken) {
    throw new PaymentServiceError(400, { error: "idToken is required" });
  }

  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdToken(idToken);
  } catch (error) {
    throw new PaymentServiceError(401, { error: "Invalid Firebase ID token" });
  }

  const storeName = trimmedOrEmpty(body?.storeName);
  const address = trimmedOrEmpty(body?.address);
  const contactPhone = trimmedOrEmpty(body?.contactPhone);
  if (!storeName || storeName.length > MAX_STORE_NAME_LENGTH) {
    throw new PaymentServiceError(400, { error: `storeName is required (max ${MAX_STORE_NAME_LENGTH} chars)` });
  }
  if (!address || address.length > MAX_ADDRESS_LENGTH) {
    throw new PaymentServiceError(400, { error: `address is required (max ${MAX_ADDRESS_LENGTH} chars)` });
  }
  if (!contactPhone || contactPhone.length > MAX_CONTACT_PHONE_LENGTH) {
    throw new PaymentServiceError(400, { error: `contactPhone is required (max ${MAX_CONTACT_PHONE_LENGTH} chars)` });
  }

  const result = await merchantApplicationRepository.createApplication({
    applicantFirebaseUid: firebaseUser.uid,
    applicantEmail: firebaseUser.email || null,
    // Firebase Admin SDK's decoded ID token exposes the display name as `.name`, not
    // `.displayName` -- that field only exists on the mobile client SDK's own user object.
    applicantDisplayName: firebaseUser.name || null,
    storeName,
    address,
    contactPhone,
    now,
  });

  if (result.error) {
    throw new PaymentServiceError(merchantApplicationErrorStatusCode(result.error), {
      ...result,
      error: merchantApplicationErrorMessage(result.error),
      status: result.error,
    });
  }
  return result;
}

async function approveMerchantApplication({ authUser, applicationId, body, merchantApplicationRepository } = {}) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }

  const application = await merchantApplicationRepository.getApplicationById({ applicationId });
  if (!application) {
    throw new PaymentServiceError(404, { error: "Merchant application not found" });
  }
  if (application.status !== "pending") {
    throw new PaymentServiceError(409, {
      error: `Merchant application is already ${application.status}`,
      status: application.status,
      application,
    });
  }

  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new PaymentServiceError(400, { error: "latitude must be a number between -90 and 90" });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new PaymentServiceError(400, { error: "longitude must be a number between -180 and 180" });
  }

  const result = await merchantApplicationRepository.approveApplication({
    applicationId,
    latitude,
    longitude,
    actorUserId: authUser.id,
  });
  if (result.error) {
    throw new PaymentServiceError(merchantApplicationErrorStatusCode(result.error), {
      ...result,
      error: merchantApplicationErrorMessage(result.error),
      status: result.error,
    });
  }
  return result;
}

async function rejectMerchantApplication({ authUser, applicationId, body, merchantApplicationRepository } = {}) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }

  const application = await merchantApplicationRepository.getApplicationById({ applicationId });
  if (!application) {
    throw new PaymentServiceError(404, { error: "Merchant application not found" });
  }
  if (application.status !== "pending") {
    throw new PaymentServiceError(409, {
      error: `Merchant application is already ${application.status}`,
      status: application.status,
      application,
    });
  }

  const reason = trimmedOrEmpty(body?.reason);
  if (!reason) {
    throw new PaymentServiceError(400, { error: "reason is required" });
  }

  const rejected = await merchantApplicationRepository.rejectApplication({
    applicationId,
    rejectionReason: reason,
    actorUserId: authUser.id,
  });
  return { application: rejected };
}

function trimmedOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function merchantApplicationErrorStatusCode(error) {
  const statusCodes = {
    application_already_pending: 409,
    applicant_already_merchant: 409,
  };
  return statusCodes[error] || 400;
}

function merchantApplicationErrorMessage(error) {
  const messages = {
    application_already_pending: "This Google account already has a pending merchant application",
    applicant_already_merchant: "This Google account is already linked to a merchant store",
  };
  return messages[error] || "Merchant application failed";
}

module.exports = {
  approveMerchantApplication,
  rejectMerchantApplication,
  submitMerchantApplication,
};
