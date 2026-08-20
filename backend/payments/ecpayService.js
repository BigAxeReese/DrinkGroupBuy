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

async function withEcpayOperationLock(orderId, operation, repository) {
  if (repository?.kind === "postgres") {
    try {
      return await repository.withOperationLock(orderId, operation);
    } catch (error) {
      if (error.code === "operation_locked") {
        throw new PaymentServiceError(409, {
          error: "payment_operation_locked",
          status: "retry_later",
          lockKey: error.lock?.lockKey
        });
      }
      throw error;
    }
  }

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

async function requestEcpayAuthorization({ authUser, body, ecpayAuthorizationRepository } = {}) {
  if (!authUser) {
    throw new PaymentServiceError(401, { error: "Authentication required" });
  }
  if (!body?.orderId) {
    throw new PaymentServiceError(400, { error: "Missing required field: orderId" });
  }

  return withEcpayOperationLock(
    body.orderId,
    () => requestEcpayAuthorizationUnlocked({ authUser, body, ecpayAuthorizationRepository }),
    ecpayAuthorizationRepository
  );
}

async function requestEcpayAuthorizationUnlocked({ authUser, body, ecpayAuthorizationRepository }) {
  const provider = body.provider === "mock_ecpay" ? "mock_ecpay" : "ecpay";

  const order = await (ecpayAuthorizationRepository
    ? ecpayAuthorizationRepository.getOrderPaymentContext(body.orderId)
    : getOrderPaymentContext(body.orderId));
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

  const existingAuthorization = await (ecpayAuthorizationRepository
    ? ecpayAuthorizationRepository.getLatestAuthorizationForOrder(body.orderId)
    : getLatestAuthorizationForOrder(body.orderId));
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
  const createPendingInput = {
    orderId: body.orderId,
    amount: Number(body.amount),
    provider,
    providerTransactionId: merchantTradeNo
  };
  const authorization = await (ecpayAuthorizationRepository
    ? ecpayAuthorizationRepository.createPendingAuthorization(createPendingInput)
    : createPendingPaymentAuthorization(createPendingInput));
  if (!authorization) {
    // The order's amount changed between the check above and the (now amount-revalidating)
    // insert -- most likely a concurrent PATCH /api/orders/:orderId edit. Surface a clear,
    // retryable error instead of returning a "success" response with authorization: null.
    throw new PaymentServiceError(409, {
      error: "Order changed before the ECPay authorization could be created",
      status: "order_changed_retry"
    });
  }

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
async function renderEcpayCheckoutRedirectHtml(orderId, ecpayAuthorizationRepository) {
  const authorization = await (ecpayAuthorizationRepository
    ? ecpayAuthorizationRepository.getLatestAuthorizationForOrder(orderId)
    : getLatestAuthorizationForOrder(orderId));
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
async function handleEcpayReturnWebhook({ orderId, formFields, ecpayAuthorizationRepository }) {
  if (!verifyEcpayCheckMacValue(formFields)) {
    return { error: "invalid_check_mac_value" };
  }

  const pendingAuthorization = await (ecpayAuthorizationRepository
    ? ecpayAuthorizationRepository.getLatestAuthorizationForOrder(orderId)
    : getLatestAuthorizationForOrder(orderId));
  if (!pendingAuthorization || !isEcpayProvider(pendingAuthorization.provider)) {
    return { error: "ecpay_authorization_not_found" };
  }

  const authorizeInput = {
    orderId,
    provider: pendingAuthorization.provider,
    amount: pendingAuthorization.originalAmount,
    providerPayload: formFields
  };
  return withEcpayOperationLock(orderId, () => (
    ecpayAuthorizationRepository
      ? ecpayAuthorizationRepository.authorizeAuthorization(authorizeInput)
      : authorizePaymentInDatabase(authorizeInput)
  ), ecpayAuthorizationRepository);
}

async function captureEcpayAuthorization({
  orderId,
  provider = "ecpay",
  amount,
  finalAmount,
  reason = "ecpay_capture",
  paymentCaptureRepository,
  ecpayAuthorizationRepository
} = {}) {
  const context = await (paymentCaptureRepository
    ? paymentCaptureRepository.getAuthorizationContext({ orderId, provider })
    : getPaymentAuthorizationContext({ orderId, provider }));
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
        tradeNo: await getEcpayTradeNo(authorization, ecpayAuthorizationRepository),
        amount: captureAmount
      });

  const captureInput = {
    orderId: authorization.orderId,
    providerTransactionId: authorization.providerAuthorizationId,
    provider,
    providerCaptureId: null,
    amount: captureAmount,
    finalAmount: resolvedFinalAmount,
    reason,
    providerPayload: payload
  };
  const captureResult = await (paymentCaptureRepository
    ? paymentCaptureRepository.captureAuthorization(captureInput)
    : capturePaymentInDatabase(captureInput));

  if (captureResult?.error) {
    throw new PaymentServiceError(409, captureResult);
  }

  return { ...captureResult, payload };
}

async function voidEcpayAuthorization({
  orderId,
  provider = "ecpay",
  reason = "ecpay_void_authorization",
  authorizationCancelRepository,
  ecpayAuthorizationRepository
} = {}) {
  const context = await (authorizationCancelRepository
    ? authorizationCancelRepository.getAuthorizationContext({ orderId, provider })
    : getPaymentAuthorizationContext({ orderId, provider }));
  if (!context) return null;
  const authorization = context.authorization;

  if (authorization.status === "authorization_voided") {
    return { authorization, status: "authorization_voided" };
  }

  const payload = provider === "mock_ecpay"
    ? { RtnCode: "1", RtnMsg: "mock_cancel_success" }
    : await cancelEcpayCreditCardAuthorization({
        merchantTradeNo: authorization.providerAuthorizationId,
        tradeNo: await getEcpayTradeNo(authorization, ecpayAuthorizationRepository),
        amount: authorization.authorizedAmount
      });

  const voidInput = {
    orderId: authorization.orderId,
    providerTransactionId: authorization.providerAuthorizationId,
    provider,
    reason,
    providerPayload: payload
  };
  const voidResult = await (authorizationCancelRepository
    ? authorizationCancelRepository.voidAuthorization(voidInput)
    : voidPaymentInDatabase(voidInput));

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

// `repository` may be a paymentRefundRepository (refund path) or an
// ecpayAuthorizationRepository (capture/void paths) -- both expose the same
// getLatestProviderEventPayload(lookupInput) shape over the shared payment_provider_events
// table, so either works interchangeably here.
async function getEcpayTradeNo(authorization, repository) {
  const lookupInput = {
    resourceType: "authorization",
    resourceId: authorization.id,
    eventType: "confirm_success"
  };
  const webhookPayload = repository
    ? await repository.getLatestProviderEventPayload(lookupInput)
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
