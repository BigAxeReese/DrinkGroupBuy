const { randomUUID } = require("node:crypto");
const {
  acquireOperationLock,
  authorizeLinePayPaymentInDatabase: authorizePaymentInDatabase,
  captureLinePayAuthorizationInDatabase: capturePaymentInDatabase,
  completeLinePayRefundInDatabase: completePaymentRefundInDatabase,
  createPendingLinePayAuthorization: createPendingPaymentAuthorization,
  createPendingLinePayRefundInDatabase: createPendingPaymentRefundInDatabase,
  failLinePayRefundInDatabase: failPaymentRefundInDatabase,
  getLatestLinePayAuthorizationForOrder: getLatestAuthorizationForOrder,
  getLatestPaymentProviderEventPayload,
  getLinePayAuthorizationContext: getPaymentAuthorizationContext,
  getOrderPaymentContext,
  releaseOperationLock,
  voidLinePayAuthorizationInDatabase: voidPaymentInDatabase
} = require("../db");
const { PaymentServiceError } = require("./linePayService");
const {
  buildEcpayCheckoutForm,
  cancelEcpayCreditCardAuthorization,
  closeEcpayCreditCardAuthorization,
  refundEcpayPayment: callEcpayRefund,
  verifyEcpayCheckMacValue
} = require("./ecpayClient");

async function withEcpayOperationLock(orderId, operation) {
  const ownerId = `ecpay-operation-${process.pid}-${randomUUID()}`;
  const lockKey = `ecpay:${orderId}`;
  const lock = acquireOperationLock({ lockKey, ownerId, leaseMs: 120_000 });
  if (!lock.acquired) {
    throw new PaymentServiceError(409, {
      error: "payment_operation_locked",
      status: "retry_later",
      lockKey,
      lockedUntil: lock.lockedUntil
    });
  }
  try {
    return await operation();
  } finally {
    releaseOperationLock({ lockKey, ownerId });
  }
}

function isEcpayProvider(provider) {
  return typeof provider === "string" && provider.endsWith("ecpay");
}

function generateEcpayMerchantTradeNo() {
  return randomUUID().replace(/-/g, "").slice(0, 20);
}

async function requestEcpayAuthorization({ authUser, body } = {}) {
  if (!authUser) {
    throw new PaymentServiceError(401, { error: "Authentication required" });
  }
  if (!body?.orderId) {
    throw new PaymentServiceError(400, { error: "Missing required field: orderId" });
  }

  return withEcpayOperationLock(body.orderId, () => requestEcpayAuthorizationUnlocked({ authUser, body }));
}

async function requestEcpayAuthorizationUnlocked({ authUser, body }) {
  const provider = body.provider === "mock_ecpay" ? "mock_ecpay" : "ecpay";

  const order = getOrderPaymentContext(body.orderId);
  if (!order) {
    throw new PaymentServiceError(404, {
      error: "Order not found in backend database",
      nextStep: "Create the order in the backend before requesting an ECPay authorization."
    });
  }
  if (order.customerUserId !== authUser.id && !authUser.roles.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Order access denied" });
  }
  if (order.originalAmount !== Number(body.amount)) {
    throw new PaymentServiceError(409, {
      error: "ECPay authorization amount does not match order original amount",
      orderOriginalAmount: order.originalAmount,
      requestedAmount: Number(body.amount)
    });
  }

  const existingAuthorization = getLatestAuthorizationForOrder(body.orderId);
  if (order.paymentStatus === "authorized" || existingAuthorization?.status === "authorized") {
    throw new PaymentServiceError(409, {
      error: "Order is already authorized",
      status: "already_authorized",
      authorization: existingAuthorization
    });
  }
  if (existingAuthorization?.status === "pending") {
    throw new PaymentServiceError(409, {
      error: "Order already has a pending payment authorization",
      status: "authorization_already_pending",
      authorization: existingAuthorization
    });
  }

  const merchantTradeNo = generateEcpayMerchantTradeNo();
  const authorization = createPendingPaymentAuthorization({
    orderId: body.orderId,
    amount: Number(body.amount),
    provider,
    providerTransactionId: merchantTradeNo
  });

  return {
    provider,
    orderId: body.orderId,
    authorization,
    paymentUrl: {
      web: buildCheckoutRedirectUrl(body.orderId),
      app: buildCheckoutRedirectUrl(body.orderId)
    },
    status: "payment_url_created"
  };
}

function buildCheckoutRedirectUrl(orderId) {
  // Derive from ECPAY_RETURN_URL (already required by assertEcpayConfig) rather than a
  // separate env var, so there is only one backend base URL to keep in sync per environment.
  const backendUrl = process.env.ECPAY_BACKEND_PUBLIC_URL
    || (process.env.ECPAY_RETURN_URL || "").replace(/\/api\/payments\/ecpay\/return$/, "");
  return `${backendUrl}/api/payments/ecpay/checkout-redirect?orderId=${encodeURIComponent(orderId)}`;
}

// Renders the auto-submitting HTML form that carries the customer to ECPay's hosted
// checkout page. AioCheckOut is a POST redirect, unlike LINE Pay's single GET URL, so
// mobile opens this intermediary page instead of an ECPay URL directly.
function renderEcpayCheckoutRedirectHtml(orderId) {
  const authorization = getLatestAuthorizationForOrder(orderId);
  if (!authorization || authorization.status !== "pending" || !isEcpayProvider(authorization.provider)) {
    return null;
  }

  const { action, fields } = buildEcpayCheckoutForm({
    orderId,
    merchantTradeNo: authorization.providerAuthorizationId,
    amount: authorization.originalAmount,
    itemName: "DrinkGroupBuy preorder"
  });

  const inputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}">`)
    .join("\n");

  return `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>前往信用卡付款</title></head>
<body onload="document.forms[0].submit()">
  <p>正在導向信用卡付款頁面…</p>
  <form method="POST" action="${escapeHtml(action)}">
    ${inputs}
  </form>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Handles the ReturnURL webhook (the authoritative confirmation). Caller (server.js) is
// responsible for reading orderId off the request URL and replying "1|OK" on success,
// regardless of whether the underlying order/authorization state turns out to be valid.
async function handleEcpayReturnWebhook({ orderId, formFields }) {
  if (!verifyEcpayCheckMacValue(formFields)) {
    return { error: "invalid_check_mac_value" };
  }

  const pendingAuthorization = getLatestAuthorizationForOrder(orderId);
  if (!pendingAuthorization || !isEcpayProvider(pendingAuthorization.provider)) {
    return { error: "ecpay_authorization_not_found" };
  }

  return withEcpayOperationLock(orderId, () => authorizePaymentInDatabase({
    orderId,
    provider: pendingAuthorization.provider,
    amount: pendingAuthorization.originalAmount,
    providerPayload: formFields
  }));
}

async function captureEcpayAuthorization({ orderId, provider = "ecpay", amount, finalAmount, reason = "ecpay_capture" } = {}) {
  const context = getPaymentAuthorizationContext({ orderId, provider });
  if (!context) return null;

  const authorization = context.authorization;
  const captureAmount = amount == null ? authorization.authorizedAmount : Number(amount);
  const resolvedFinalAmount = finalAmount == null ? captureAmount : Number(finalAmount);

  if (authorization.status === "captured") {
    return { authorization, status: "captured" };
  }
  if (authorization.status !== "authorized") {
    throw new PaymentServiceError(409, {
      error: "ECPay authorization is not capturable",
      status: authorization.status,
      authorization
    });
  }

  const payload = provider === "mock_ecpay"
    ? { RtnCode: "1", RtnMsg: "mock_close_success" }
    : await closeEcpayCreditCardAuthorization({
        merchantTradeNo: authorization.providerAuthorizationId,
        tradeNo: await getEcpayTradeNo(authorization),
        amount: captureAmount
      });

  const captureResult = capturePaymentInDatabase({
    orderId: authorization.orderId,
    providerTransactionId: authorization.providerAuthorizationId,
    provider,
    providerCaptureId: null,
    amount: captureAmount,
    finalAmount: resolvedFinalAmount,
    reason,
    providerPayload: payload
  });

  if (captureResult?.error) {
    throw new PaymentServiceError(409, captureResult);
  }

  return { ...captureResult, payload };
}

async function voidEcpayAuthorization({ orderId, provider = "ecpay", reason = "ecpay_void_authorization" } = {}) {
  const context = getPaymentAuthorizationContext({ orderId, provider });
  if (!context) return null;
  const authorization = context.authorization;

  if (authorization.status === "authorization_voided") {
    return { authorization, status: "authorization_voided" };
  }

  const payload = provider === "mock_ecpay"
    ? { RtnCode: "1", RtnMsg: "mock_cancel_success" }
    : await cancelEcpayCreditCardAuthorization({
        merchantTradeNo: authorization.providerAuthorizationId,
        tradeNo: await getEcpayTradeNo(authorization),
        amount: authorization.authorizedAmount
      });

  const voidResult = voidPaymentInDatabase({
    orderId: authorization.orderId,
    providerTransactionId: authorization.providerAuthorizationId,
    provider,
    reason,
    providerPayload: payload
  });

  if (voidResult?.error) {
    throw new PaymentServiceError(409, voidResult);
  }

  return voidResult;
}

async function refundEcpayPayment({ authUser, body, paymentRefundRepository } = {}) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }
  if (!body?.orderId && !body?.captureId) {
    throw new PaymentServiceError(400, { error: "Missing required field: orderId or captureId" });
  }

  const provider = body.provider === "mock_ecpay" ? "mock_ecpay" : "ecpay";
  const createPendingRefundInput = {
    orderId: body.orderId,
    captureId: body.captureId,
    provider,
    refundAmount: body.refundAmount ?? body.amount,
    idempotencyKey: body.idempotencyKey,
    reason: body.reason || "ecpay_refund_requested",
    actorUserId: authUser.id
  };
  const pendingRefund = paymentRefundRepository
    ? await paymentRefundRepository.createPendingRefund(createPendingRefundInput)
    : createPendingPaymentRefundInDatabase(createPendingRefundInput);

  if (!pendingRefund) {
    throw new PaymentServiceError(404, { error: "Captured payment not found" });
  }
  if (pendingRefund.error) {
    throw new PaymentServiceError(409, pendingRefund);
  }
  if (pendingRefund.alreadyExists) {
    if (pendingRefund.refund?.status === "refunded") {
      return { ...pendingRefund, status: "refunded", idempotent: true };
    }
    throw new PaymentServiceError(409, {
      error: "Refund is already pending or previously failed",
      refund: pendingRefund.refund
    });
  }

  const merchantTradeNo = pendingRefund.authorization?.providerAuthorizationId;
  let payload;
  try {
    payload = provider === "mock_ecpay"
      ? { RtnCode: "1", RtnMsg: "mock_refund_success" }
      : await callEcpayRefund({
          merchantTradeNo,
          tradeNo: await getEcpayTradeNo(pendingRefund.authorization, paymentRefundRepository),
          amount: pendingRefund.refund.refundAmount
        });
  } catch (error) {
    const failInput = {
      refundId: pendingRefund.refund.id,
      reason: "ecpay_refund_failed",
      actorUserId: authUser.id,
      providerPayload: error.ecpayPayload || { message: error.message }
    };
    const failed = paymentRefundRepository
      ? await paymentRefundRepository.failRefund(failInput)
      : failPaymentRefundInDatabase(failInput);
    throw new PaymentServiceError(error.statusCode || 502, {
      error: "ECPay refund failed",
      refund: failed?.refund || pendingRefund.refund,
      providerError: error.ecpayPayload || { message: error.message }
    });
  }

  const completeRefundInput = {
    refundId: pendingRefund.refund.id,
    providerRefundId: null,
    providerPayload: payload,
    actorUserId: authUser.id
  };
  const completedRefund = paymentRefundRepository
    ? await paymentRefundRepository.completeRefund(completeRefundInput)
    : completePaymentRefundInDatabase(completeRefundInput);

  if (completedRefund?.error) {
    throw new PaymentServiceError(409, completedRefund);
  }

  return { ...completedRefund, provider, payload };
}

async function getEcpayTradeNo(authorization, paymentRefundRepository) {
  const lookupInput = {
    resourceType: "authorization",
    resourceId: authorization.id,
    eventType: "confirm_success"
  };
  const webhookPayload = paymentRefundRepository
    ? await paymentRefundRepository.getLatestProviderEventPayload(lookupInput)
    : getLatestPaymentProviderEventPayload(lookupInput);
  return webhookPayload?.TradeNo || null;
}

module.exports = {
  captureEcpayAuthorization,
  handleEcpayReturnWebhook,
  isEcpayProvider,
  refundEcpayPayment,
  renderEcpayCheckoutRedirectHtml,
  requestEcpayAuthorization,
  voidEcpayAuthorization
};
