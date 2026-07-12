const {
  authorizeLinePayPaymentInDatabase,
  cancelPendingLinePayAuthorizationInDatabase,
  captureLinePayAuthorizationInDatabase,
  createPendingLinePayAuthorization,
  getLinePayAuthorizationContext,
  getLatestLinePayAuthorizationForOrder,
  getLatestLinePayAuthorizationForOrderRevision,
  getOrderPaymentContext,
  getOrderRevisionPaymentContext,
  recordLinePayCaptureFailureInDatabase,
  recordLinePayVoidFailureInDatabase,
  voidLinePayAuthorizationInDatabase
} = require("../db");
const {
  captureLinePayPaymentAuthorization,
  confirmLinePayPayment,
  getLinePayConfig,
  requestLinePayPayment,
  voidLinePayPaymentAuthorization
} = require("./linePayClient");
const {
  clearPendingLinePayAuthorizationsForOrderUpdate,
  deletePendingLinePayPayment,
  findPendingLinePayPayment,
  savePendingLinePayPayment
} = require("./linePayPendingStore");

class PaymentServiceError extends Error {
  constructor(statusCode, payload) {
    super(payload.error);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function createMockLinePayPayload(returnMessage, transactionId, orderId) {
  return {
    returnCode: "0000",
    returnMessage,
    info: {
      transactionId,
      orderId
    }
  };
}

async function requestLinePayAuthorization({ authUser, body }) {
  const validationError = validateLinePayRequest(body);
  if (validationError) {
    throw new PaymentServiceError(400, { error: validationError });
  }

  const revision = body.orderRevisionId
    ? getOrderRevisionPaymentContext(body.orderRevisionId)
    : null;
  if (body.orderRevisionId && !revision) {
    throw new PaymentServiceError(404, {
      error: "Order revision not found"
    });
  }
  if (revision && revision.orderId !== body.orderId) {
    throw new PaymentServiceError(409, {
      error: "Order revision does not belong to order",
      orderId: body.orderId,
      orderRevisionId: body.orderRevisionId
    });
  }
  if (revision && revision.status !== "pending_authorization") {
    throw new PaymentServiceError(409, {
      error: "Order revision is not waiting for authorization",
      status: revision.status
    });
  }

  const order = revision
    ? {
        id: revision.orderId,
        customerUserId: revision.customerUserId,
        originalAmount: revision.originalAmount,
        paymentStatus: revision.paymentStatus,
        authorizationStatus: revision.authorizationStatus
      }
    : getOrderPaymentContext(body.orderId);
  if (!order) {
    throw new PaymentServiceError(404, {
      error: "Order not found in backend database",
      nextStep: "Create the order in the backend before requesting LINE Pay authorization."
    });
  }
  if (order.customerUserId !== authUser.id && !authUser.roles.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Order access denied" });
  }
  if (order.originalAmount !== Number(body.amount)) {
    throw new PaymentServiceError(409, {
      error: "LINE Pay authorization amount does not match order original amount",
      orderOriginalAmount: order.originalAmount,
      requestedAmount: Number(body.amount)
    });
  }
  const linePayConfig = getLinePayConfig();
  if (!linePayConfig.captureSeparated) {
    throw new PaymentServiceError(409, {
      error: "LINE Pay capture-separated payment is not enabled",
      status: "capture_separated_not_enabled",
      nextStep: "Set LINE_PAY_CAPTURE_SEPARATED=true only after LINE Pay has enabled capture-separated payments for this channel."
    });
  }

  const existingAuthorization = revision
    ? getLatestLinePayAuthorizationForOrderRevision(revision.id)
    : getLatestLinePayAuthorizationForOrder(body.orderId);
  if (order.paymentStatus === "authorized" || existingAuthorization?.status === "authorized") {
    if (!revision) {
      throw new PaymentServiceError(409, {
        error: "Order is already authorized",
        status: "already_authorized",
        authorization: existingAuthorization
      });
    }
    if (existingAuthorization?.status === "authorized") {
      throw new PaymentServiceError(409, {
        error: "Order revision is already authorized",
        status: "already_authorized",
        authorization: existingAuthorization
      });
    }
  }
  if (existingAuthorization?.status === "pending") {
    throw new PaymentServiceError(409, {
      error: "Order already has a pending LINE Pay authorization",
      status: "authorization_already_pending",
      authorization: existingAuthorization
    });
  }

  const payload = await requestLinePayPayment(body);
  const info = payload.info || {};
  const transactionId = info.transactionId ? String(info.transactionId) : null;
  const authorization = createPendingLinePayAuthorization({
    orderId: body.orderId,
    orderRevisionId: revision?.id || null,
    amount: Number(body.amount),
    providerTransactionId: transactionId
  });
  const pendingPayment = {
    orderId: body.orderId,
    orderRevisionId: revision?.id || null,
    amount: Number(body.amount),
    currency: body.currency || process.env.LINE_PAY_CURRENCY || "TWD",
    transactionId,
    authorizationId: authorization?.id,
    createdAt: new Date().toISOString()
  };

  savePendingLinePayPayment(pendingPayment);

  return {
    provider: "line_pay",
    orderId: body.orderId,
    orderRevisionId: revision?.id || null,
    transactionId,
    authorization,
    paymentUrl: info.paymentUrl,
    paymentAccessToken: info.paymentAccessToken,
    status: "payment_url_created"
  };
}

async function confirmLinePayAuthorization({ transactionId, orderId }) {
  const pendingPayment = findPendingLinePayPayment({ orderId, transactionId });
  const context = pendingPayment
    ? null
    : getLinePayAuthorizationContext({
        orderId,
        providerTransactionId: transactionId
      });

  if (!transactionId || (!pendingPayment && !context)) {
    return null;
  }

  const resolvedOrderId = pendingPayment?.orderId || context.authorization.orderId;
  const resolvedOrderRevisionId = pendingPayment?.orderRevisionId || context.authorization.orderRevisionId || null;
  const amount = pendingPayment?.amount || context.amount;
  const currency = pendingPayment?.currency || context.currency;
  const resolvedPendingPayment = pendingPayment || {
    orderId: resolvedOrderId,
    amount,
    currency,
    transactionId,
    authorizationId: context.authorization.id,
    orderRevisionId: context.authorization.orderRevisionId || null,
    source: "database"
  };

  if (context?.authorization?.status === "authorized") {
    return {
      authorization: context.authorization,
      payload: { returnCode: "already_authorized" },
      pendingPayment: resolvedPendingPayment
    };
  }

  if (context?.authorization?.status && context.authorization.status !== "pending") {
    return {
      error: "authorization_not_pending",
      authorization: context.authorization,
      pendingPayment: resolvedPendingPayment
    };
  }

  const payload = await confirmLinePayPayment(transactionId, {
    amount,
    currency
  });
  const authorizationResult = authorizeLinePayPaymentInDatabase({
    orderId: resolvedOrderId,
    orderRevisionId: resolvedOrderRevisionId,
    providerTransactionId: transactionId,
    amount,
    providerPayload: payload
  });
  deletePendingLinePayPayment({
    orderId: resolvedOrderId,
    transactionId
  });

  if (!authorizationResult) {
    return {
      error: "authorization_not_found_after_confirm",
      payload,
      pendingPayment: resolvedPendingPayment
    };
  }

  if (authorizationResult?.error) {
    let voidResult = null;
    let voidError = null;

    if ([
      "capacity_exceeded",
      "authorization_confirmed_after_deadline",
      "authorization_expiry_missing",
      "authorization_expiry_invalid",
      "authorization_expiry_too_short"
    ].includes(authorizationResult.error)) {
      try {
        voidResult = await voidLinePayAuthorization({
          orderId: resolvedOrderId,
          transactionId,
          reason: `${authorizationResult.error}_at_confirm`
        });
      } catch (error) {
        try {
          recordLinePayVoidFailureInDatabase({
            orderId: resolvedOrderId,
            providerTransactionId: transactionId,
            reason: `${authorizationResult.error}_at_confirm_void_failed`,
            providerPayload: error.linePayPayload || { message: error.message }
          });
        } catch {
          // Keep the original LINE Pay void error visible to the caller.
        }
        voidError = {
          message: error.message,
          linePayPayload: error.linePayPayload || null
        };
      }
    }

    return {
      ...authorizationResult,
      payload,
      pendingPayment: resolvedPendingPayment,
      voidResult,
      voidError
    };
  }

  if (authorizationResult?.status && authorizationResult.status !== "authorized") {
    return {
      error: "authorization_not_authorized",
      authorization: authorizationResult,
      payload,
      pendingPayment: resolvedPendingPayment
    };
  }

  const replacementVoidResult = await voidReplacedAuthorizationIfNeeded({
    authorizationResult,
    orderId: resolvedOrderId
  });

  return {
    authorization: authorizationResult,
    replacementVoidResult,
    payload,
    pendingPayment: resolvedPendingPayment
  };
}

async function voidReplacedAuthorizationIfNeeded({ authorizationResult, orderId }) {
  const replacedAuthorization = authorizationResult?.replacedAuthorization;
  if (!replacedAuthorization || replacedAuthorization.status !== "authorized") {
    return null;
  }

  try {
    return await voidLinePayAuthorization({
      orderId,
      transactionId: replacedAuthorization.providerAuthorizationId,
      provider: replacedAuthorization.provider,
      reason: "order_revision_replaced_authorization"
    });
  } catch (error) {
    try {
      recordLinePayVoidFailureInDatabase({
        orderId,
        provider: replacedAuthorization.provider,
        providerTransactionId: replacedAuthorization.providerAuthorizationId,
        reason: "order_revision_replaced_authorization_void_failed",
        providerPayload: error.linePayPayload || { message: error.message }
      });
    } catch {
      // Keep the replacement authorization success visible to the caller.
    }

    return {
      error: "replacement_void_failed",
      message: error.message,
      linePayPayload: error.linePayPayload || null
    };
  }
}

async function captureLinePayAuthorization({
  transactionId,
  orderId,
  provider = "line_pay",
  amount,
  finalAmount,
  currency,
  reason = "line_pay_capture"
}) {
  const context = getLinePayAuthorizationContext({
    orderId,
    providerTransactionId: transactionId,
    provider
  });

  if (!context) {
    return null;
  }

  const authorization = context.authorization;
  const resolvedTransactionId = transactionId || authorization.providerAuthorizationId;
  const captureAmount = amount == null ? authorization.authorizedAmount : Number(amount);
  const resolvedFinalAmount = finalAmount == null ? captureAmount : Number(finalAmount);
  const resolvedCurrency = currency || context.currency;

  if (!resolvedTransactionId) {
    throw new PaymentServiceError(409, {
      error: "LINE Pay transaction ID is required to capture authorization"
    });
  }

  if (authorization.status === "captured") {
    return {
      authorization,
      payload: { returnCode: "already_captured" },
      status: "captured"
    };
  }

  if (authorization.status !== "authorized") {
    throw new PaymentServiceError(409, {
      error: "LINE Pay authorization is not capturable",
      status: authorization.status,
      authorization
    });
  }

  if (!Number.isInteger(captureAmount) || captureAmount <= 0) {
    throw new PaymentServiceError(400, {
      error: "capture amount must be a positive integer"
    });
  }

  if (!Number.isInteger(resolvedFinalAmount) || resolvedFinalAmount < 0) {
    throw new PaymentServiceError(400, {
      error: "final amount must be a non-negative integer"
    });
  }

  if (captureAmount > authorization.authorizedAmount) {
    throw new PaymentServiceError(409, {
      error: "capture amount exceeds authorized amount",
      authorizedAmount: authorization.authorizedAmount,
      captureAmount
    });
  }

  let payload;
  try {
    payload = provider === "mock_line_pay"
      ? createMockLinePayPayload("mock_capture", resolvedTransactionId, authorization.orderId)
      : await captureLinePayPaymentAuthorization(resolvedTransactionId, {
          amount: captureAmount,
          currency: resolvedCurrency
        });
  } catch (error) {
    try {
      recordLinePayCaptureFailureInDatabase({
        orderId: authorization.orderId,
        providerTransactionId: resolvedTransactionId,
        provider,
        amount: captureAmount,
        finalAmount: resolvedFinalAmount,
        reason: `${reason}_failed`,
        providerPayload: error.linePayPayload || { message: error.message }
      });
    } catch {
      // Keep the original LINE Pay capture error visible to the caller.
    }
    throw error;
  }

  const captureResult = captureLinePayAuthorizationInDatabase({
    orderId: authorization.orderId,
    providerTransactionId: resolvedTransactionId,
    provider,
    providerCaptureId: payload.info?.transactionId ? String(payload.info.transactionId) : null,
    amount: captureAmount,
    finalAmount: resolvedFinalAmount,
    reason,
    providerPayload: payload
  });

  if (captureResult?.error) {
    throw new PaymentServiceError(409, captureResult);
  }

  return {
    ...captureResult,
    payload
  };
}

async function voidLinePayAuthorization({
  transactionId,
  orderId,
  provider = "line_pay",
  reason = "line_pay_void_authorization"
}) {
  const context = getLinePayAuthorizationContext({
    orderId,
    providerTransactionId: transactionId,
    provider
  });

  if (!context) {
    return null;
  }

  const authorization = context.authorization;
  const resolvedTransactionId = transactionId || authorization.providerAuthorizationId;

  if (!resolvedTransactionId) {
    throw new PaymentServiceError(409, {
      error: "LINE Pay transaction ID is required to void authorization"
    });
  }

  if (authorization.status === "authorization_voided") {
    return {
      authorization,
      payload: { returnCode: "already_voided" },
      status: "authorization_voided"
    };
  }

  if (authorization.status === "captured") {
    throw new PaymentServiceError(409, {
      error: "Captured LINE Pay authorization cannot be voided; refund is required",
      authorization
    });
  }

  if (!["authorized", "failed"].includes(authorization.status)) {
    throw new PaymentServiceError(409, {
      error: "LINE Pay authorization is not voidable",
      status: authorization.status,
      authorization
    });
  }

  const payload = provider === "mock_line_pay"
    ? createMockLinePayPayload("mock_void", resolvedTransactionId, authorization.orderId)
    : await voidLinePayPaymentAuthorization(resolvedTransactionId);
  const voidedAuthorization = voidLinePayAuthorizationInDatabase({
    orderId: authorization.orderId,
    providerTransactionId: resolvedTransactionId,
    provider,
    reason,
    providerPayload: payload
  });

  if (voidedAuthorization?.error) {
    throw new PaymentServiceError(409, voidedAuthorization);
  }

  return {
    authorization: voidedAuthorization,
    payload,
    status: "authorization_voided"
  };
}

function cancelLinePayAuthorization({ transactionId, orderId }) {
  const pendingPayment = findPendingLinePayPayment({ orderId, transactionId });
  const context = pendingPayment
    ? null
    : getLinePayAuthorizationContext({
        orderId,
        providerTransactionId: transactionId
      });
  const resolvedOrderId = pendingPayment?.orderId || context?.authorization?.orderId || orderId;
  const resolvedTransactionId = pendingPayment?.transactionId
    || context?.authorization?.providerAuthorizationId
    || transactionId;
  const authorization = cancelPendingLinePayAuthorizationInDatabase({
    orderId: resolvedOrderId,
    providerTransactionId: resolvedTransactionId,
    reason: "line_pay_cancel_redirect"
  });

  deletePendingLinePayPayment({
    orderId: resolvedOrderId,
    transactionId: resolvedTransactionId
  });

  return {
    authorization,
    pendingPayment,
    orderId: resolvedOrderId,
    transactionId: resolvedTransactionId
  };
}

function validateLinePayRequest(body) {
  if (!body.orderId) return "Missing required field: orderId";
  if (!Number.isInteger(Number(body.amount)) || Number(body.amount) <= 0) {
    return "amount must be a positive integer";
  }
  if (body.products != null && !Array.isArray(body.products)) {
    return "products must be an array";
  }
  return null;
}

module.exports = {
  PaymentServiceError,
  cancelLinePayAuthorization,
  captureLinePayAuthorization,
  clearPendingLinePayAuthorizationsForOrderUpdate,
  confirmLinePayAuthorization,
  requestLinePayAuthorization,
  voidLinePayAuthorization
};
