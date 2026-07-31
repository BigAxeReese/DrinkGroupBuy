const { randomUUID } = require("node:crypto");
const {
  acquireOperationLock,
  authorizeLinePayPaymentInDatabase,
  cancelPendingLinePayAuthorizationInDatabase,
  captureLinePayAuthorizationInDatabase,
  completeManualLinePayRepaymentInDatabase,
  completeLinePayRefundInDatabase,
  createPendingLinePayAuthorization,
  createPendingLinePayRefundInDatabase,
  enqueuePaymentReliabilityJob,
  failLinePayRefundInDatabase,
  getLinePayAuthorizationContext,
  getLatestLinePayAuthorizationForOrder,
  getLatestLinePayAuthorizationForOrderRevision,
  getManualLinePayRepaymentContext,
  getOrderPaymentContext,
  getOrderRevisionPaymentContext,
  recordLinePayCaptureFailureInDatabase,
  recordLinePayVoidFailureInDatabase,
  releaseOperationLock,
  voidLinePayAuthorizationInDatabase
} = require("../db");
const {
  captureLinePayPaymentAuthorization,
  confirmLinePayPayment,
  getLinePayConfig,
  requestLinePayPayment,
  refundLinePayPayment: refundLinePayPaymentTransaction,
  retrieveLinePayPaymentDetails,
  voidLinePayPaymentAuthorization
} = require("./linePayClient");
const {
  clearPendingLinePayAuthorizationsForOrderUpdate,
  deletePendingLinePayPayment,
  findPendingLinePayPayment,
  savePendingLinePayPayment
} = require("./linePayPendingStore");
const {
  OperationLeaseError,
  withOperationLease
} = require("../reliability/operationLease");

const manualRepaymentRequestsInFlight = new Set();

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

function createMockLinePayRefundPayload(transactionId, refundAmount) {
  return {
    returnCode: "0000",
    returnMessage: "mock_refund",
    info: {
      refundTransactionId: `mock-refund-${transactionId}`,
      refundTransactionDate: new Date().toISOString(),
      refundAmount
    }
  };
}

function classifyLinePayCaptureError(error) {
  const returnCode = String(error?.linePayPayload?.returnCode || "").toUpperCase();
  const retryable = !returnCode
    || returnCode === "1145"
    || returnCode === "1179"
    || returnCode === "1198"
    || returnCode === "9000"
    || returnCode.startsWith("190");

  return {
    returnCode: returnCode || null,
    retryable,
    reason: retryable ? "temporary_capture_failure" : "non_retryable_capture_failure"
  };
}

async function getLinePayCaptureProviderState({ transactionId, orderId, provider = "line_pay" }) {
  const context = getLinePayAuthorizationContext({
    orderId,
    providerTransactionId: transactionId,
    provider
  });
  if (!context) {
    return { state: "missing", payload: null };
  }

  if (provider === "mock_line_pay") {
    return {
      state: context.authorization.status === "captured" ? "captured" : "authorized",
      payload: createMockLinePayPayload("mock_payment_details", transactionId, orderId)
    };
  }

  try {
    const payload = await retrieveLinePayPaymentDetails(transactionId);
    return {
      state: inferLinePayPaymentState(payload),
      payload
    };
  } catch (error) {
    const returnCode = String(error?.linePayPayload?.returnCode || "").toUpperCase();
    if (returnCode === "1150") {
      return {
        state: "not_capturable",
        payload: error.linePayPayload,
        returnCode
      };
    }
    if (
      ["1155", "1159", "1180", "1199"].includes(returnCode)
      || /^12(?:8[0-9]|9[0-8])$/.test(returnCode)
    ) {
      return {
        state: "not_capturable",
        payload: error.linePayPayload,
        returnCode
      };
    }
    return {
      state: "unknown",
      payload: error.linePayPayload || { message: error.message },
      returnCode: returnCode || null
    };
  }
}

function inferLinePayPaymentState(payload) {
  const infoItems = Array.isArray(payload?.info)
    ? payload.info
    : payload?.info
      ? [payload.info]
      : [];
  const explicitStatusValues = infoItems.flatMap((info) => [
    info.payStatus,
    info.paymentStatus,
    info.status
  ]).filter(Boolean).map((value) => String(value).toUpperCase());
  const transactionTypes = infoItems
    .map((info) => info.transactionType)
    .filter(Boolean)
    .map((value) => String(value).toUpperCase());

  if (explicitStatusValues.some((value) => value.includes("CAPTURE") || value === "PAID")) {
    return "captured";
  }
  if (explicitStatusValues.some((value) => (
    value.includes("VOID")
    || value.includes("CANCEL")
    || value.includes("EXPIRE")
    || value.includes("REFUND")
  ))) {
    return "not_capturable";
  }
  if (explicitStatusValues.some((value) => value.includes("AUTHORIZATION") || value === "AUTHORIZED")) {
    return "authorized";
  }
  if (transactionTypes.some((value) => value.includes("REFUND"))) {
    return "not_capturable";
  }
  if (transactionTypes.some((value) => value.includes("CAPTURE"))) {
    return "captured";
  }
  if (transactionTypes.includes("PAYMENT")) {
    return infoItems.some((info) => info.authorizationExpireDate) ? "authorized" : "captured";
  }
  return infoItems.length === 0 ? "missing" : "unknown";
}

function enqueuePendingAuthorizationReconciliation(authorization, input = {}) {
  if (!authorization?.id || !authorization.providerAuthorizationId) return null;
  const now = input.now || new Date().toISOString();
  return enqueuePaymentReliabilityJob({
    jobType: "reconcile_line_pay_request",
    resourceType: "payment_authorization",
    resourceId: authorization.id,
    payload: {
      orderId: authorization.orderId,
      providerTransactionId: authorization.providerAuthorizationId,
      paymentFlow: authorization.paymentFlow || "authorization",
      amount: input.amount
    },
    maxAttempts: 40,
    runAfter: new Date(Date.parse(now) + 30_000).toISOString(),
    now
  });
}


async function requestLinePayAuthorization(input) {
  const { body, authorizationRequestRepository } = input;
  const validationError = validateLinePayRequest(body);
  if (validationError) {
    throw new PaymentServiceError(400, { error: validationError });
  }
  const operation = () => requestLinePayAuthorizationUnlocked(input);
  try {
    if (authorizationRequestRepository?.kind === "postgres") {
      return await authorizationRequestRepository.withRequestLock(body.orderId, operation);
    }
    return await withOperationLease({
      lockKey: `line-pay-request:${body.orderId}`,
      leaseMs: 120_000
    }, operation);
  } catch (error) {
    if (error instanceof OperationLeaseError || error?.code === "operation_locked") {
      throw new PaymentServiceError(409, {
        error: "LINE Pay authorization request is already in progress",
        status: "authorization_request_in_progress",
        lockKey: error.lock?.lockKey || null,
        lockedUntil: error.lock?.lockedUntil || null
      });
    }
    throw error;
  }
}

async function requestLinePayAuthorizationUnlocked({
  authUser,
  body,
  authorizationRequestRepository
}) {
  if (body.orderRevisionId && authorizationRequestRepository?.kind === "postgres") {
    throw new PaymentServiceError(503, {
      error: "customer_order_revision_runtime_mismatch",
      message: "PostgreSQL order revision authorization is not available yet."
    });
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
    : await (authorizationRequestRepository
        ? authorizationRequestRepository.getOrderPaymentContext(body.orderId)
        : getOrderPaymentContext(body.orderId));
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
    : await (authorizationRequestRepository
        ? authorizationRequestRepository.getLatestAuthorizationForOrder(body.orderId)
        : getLatestLinePayAuthorizationForOrder(body.orderId));
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
  const authorizationInput = {
    orderId: body.orderId,
    orderRevisionId: revision?.id || null,
    amount: Number(body.amount),
    providerTransactionId: transactionId
  };
  const authorization = revision || !authorizationRequestRepository
    ? createPendingLinePayAuthorization(authorizationInput)
    : await authorizationRequestRepository.createPendingAuthorization(authorizationInput);
  if (authorizationRequestRepository?.kind !== "postgres") {
    enqueuePendingAuthorizationReconciliation(authorization, { amount: Number(body.amount) });
  }
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

async function requestManualLinePayRepayment(input = {}) {
  const orderId = input.body?.orderId;
  if (!orderId) return requestManualLinePayRepaymentUnlocked(input);
  try {
    return await withOperationLease({
      lockKey: `order:${orderId}:payment-lifecycle`,
      leaseMs: 300_000,
      now: input.now
    }, () => requestManualLinePayRepaymentUnlocked(input));
  } catch (error) {
    if (error instanceof OperationLeaseError) {
      throw new PaymentServiceError(409, {
        error: "payment_operation_locked",
        status: "retry_later",
        lockKey: error.lock.lockKey,
        lockedUntil: error.lock.lockedUntil
      });
    }
    throw error;
  }
}

async function requestManualLinePayRepaymentUnlocked({ authUser, body, now } = {}) {
  if (!body?.orderId) {
    throw new PaymentServiceError(400, { error: "Missing required field: orderId" });
  }
  if (!authUser?.roles?.includes("customer")) {
    throw new PaymentServiceError(403, { error: "Customer role required" });
  }
  if (manualRepaymentRequestsInFlight.has(body.orderId)) {
    throw new PaymentServiceError(409, {
      error: "Manual repayment request is already being created",
      status: "repayment_request_in_progress"
    });
  }

  manualRepaymentRequestsInFlight.add(body.orderId);
  try {
    const repayment = getManualLinePayRepaymentContext(body.orderId, { now });
    if (!repayment) {
      throw new PaymentServiceError(404, { error: "Order not found" });
    }
    if (repayment.customerUserId !== authUser.id && !authUser.roles.includes("admin")) {
      throw new PaymentServiceError(403, { error: "Order access denied" });
    }
    if (!repayment.eligible) {
      throw new PaymentServiceError(409, {
        error: manualRepaymentErrorMessage(repayment.reason),
        status: repayment.reason,
        manualRepayment: repayment
      });
    }

    const originalAuthorization = repayment.originalAuthorization;
    if (!originalAuthorization?.providerAuthorizationId) {
      throw new PaymentServiceError(409, {
        error: "Original LINE Pay transaction is missing",
        status: "original_transaction_missing"
      });
    }

    const providerState = await getLinePayCaptureProviderState({
      orderId: repayment.orderId,
      transactionId: originalAuthorization.providerAuthorizationId,
      provider: originalAuthorization.provider
    });
    if (providerState.state === "captured") {
      const reconciled = captureLinePayAuthorizationInDatabase({
        orderId: repayment.orderId,
        providerTransactionId: originalAuthorization.providerAuthorizationId,
        provider: originalAuthorization.provider,
        providerCaptureId: originalAuthorization.providerAuthorizationId,
        amount: repayment.finalAmount,
        finalAmount: repayment.finalAmount,
        reason: "manual_repayment_original_capture_reconciled",
        providerPayload: providerState.payload
      });
      throw new PaymentServiceError(409, {
        error: "Original LINE Pay payment was already captured",
        status: "already_paid",
        order: reconciled?.order || null
      });
    }
    if (providerState.state === "unknown") {
      throw new PaymentServiceError(503, {
        error: "Unable to verify the original LINE Pay transaction",
        status: "original_payment_state_unknown"
      });
    }

    let originalVoidResult = null;
    if (providerState.state === "authorized") {
      try {
        originalVoidResult = await voidLinePayAuthorization({
          orderId: repayment.orderId,
          transactionId: originalAuthorization.providerAuthorizationId,
          provider: originalAuthorization.provider,
          reason: "manual_repayment_release_original_authorization"
        });
      } catch (error) {
        throw new PaymentServiceError(502, {
          error: "Unable to release the original LINE Pay authorization",
          status: "original_authorization_void_failed",
          providerError: error.linePayPayload || { message: error.message }
        });
      }
    }

    const providerOrderId = `repay-${repayment.orderId}-${randomUUID()}`.slice(0, 100);
    const payload = await requestLinePayPayment({
      orderId: repayment.orderId,
      providerOrderId,
      amount: repayment.finalAmount,
      currency: body.currency,
      productName: body.productName || "DrinkGroupBuy 訂單重新付款",
      packageName: body.packageName || "DrinkGroupBuy",
      products: [{
        name: body.productName || "DrinkGroupBuy 訂單重新付款",
        quantity: 1,
        price: repayment.finalAmount
      }],
      captureSeparated: false
    });
    const info = payload.info || {};
    const transactionId = info.transactionId ? String(info.transactionId) : null;
    if (!transactionId) {
      throw new PaymentServiceError(502, {
        error: "LINE Pay did not return a transaction ID",
        status: "provider_transaction_missing"
      });
    }
    const authorization = createPendingLinePayAuthorization({
      orderId: repayment.orderId,
      amount: repayment.finalAmount,
      providerTransactionId: transactionId,
      paymentFlow: "direct_repayment"
    });
    enqueuePendingAuthorizationReconciliation(authorization, {
      amount: repayment.finalAmount,
      now
    });
    if (!authorization) {
      throw new PaymentServiceError(500, {
        error: "Unable to persist the LINE Pay repayment",
        status: "repayment_persistence_failed"
      });
    }
    const pendingPayment = {
      orderId: repayment.orderId,
      amount: repayment.finalAmount,
      currency: body.currency || process.env.LINE_PAY_CURRENCY || "TWD",
      transactionId,
      authorizationId: authorization?.id,
      paymentFlow: "direct_repayment",
      createdAt: new Date().toISOString()
    };
    savePendingLinePayPayment(pendingPayment);

    return {
      provider: "line_pay",
      paymentFlow: "direct_repayment",
      orderId: repayment.orderId,
      transactionId,
      authorization,
      originalVoidResult,
      amount: repayment.finalAmount,
      cutoffAt: repayment.cutoffAt,
      paymentUrl: info.paymentUrl,
      paymentAccessToken: info.paymentAccessToken,
      status: "payment_url_created"
    };
  } finally {
    manualRepaymentRequestsInFlight.delete(body.orderId);
  }
}

function manualRepaymentErrorMessage(reason) {
  const messages = {
    already_paid: "Order is already paid",
    repayment_already_pending: "Order already has a pending repayment",
    payment_not_failed: "Order payment has not failed",
    automatic_capture_not_finished: "Automatic capture attempts are not finished",
    final_amount_missing: "Final payment amount is missing",
    manual_repayment_expired: "Manual repayment period has ended"
  };
  return messages[reason] || "Order is not eligible for manual repayment";
}

async function withLinePayOperationLock(input, operation) {
  const ownerId = `line-pay-operation-${process.pid}-${randomUUID()}`;
  const lockKey = `line-pay:${input.transactionId || input.orderId}`;
  const lock = acquireOperationLock({
    lockKey,
    ownerId,
    leaseMs: input.leaseMs || 120_000
  });
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

async function confirmLinePayAuthorization(input) {
  const repository = input.authorizationConfirmRepository;
  const operation = () => confirmLinePayAuthorizationUnlocked(input);
  if (repository?.kind !== "postgres") {
    return withLinePayOperationLock(input, operation);
  }
  try {
    return await repository.withConfirmLock(input, operation);
  } catch (error) {
    if (error?.code === "operation_locked") {
      throw new PaymentServiceError(409, {
        error: "payment_operation_locked",
        status: "retry_later",
        lockKey: error.lock?.lockKey || null,
        lockedUntil: error.lock?.lockedUntil || null
      });
    }
    throw error;
  }
}

async function confirmLinePayAuthorizationUnlocked({
  transactionId,
  orderId,
  authorizationConfirmRepository,
  providerConfirmer,
  providerVoider
}) {
  const pendingPayment = findPendingLinePayPayment({ orderId, transactionId });
  const contextQuery = { orderId, providerTransactionId: transactionId };
  const context = authorizationConfirmRepository
    ? await authorizationConfirmRepository.getAuthorizationContext(contextQuery)
    : getLinePayAuthorizationContext(contextQuery);

  if (!transactionId || (!pendingPayment && !context)) {
    return null;
  }

  const resolvedOrderId = pendingPayment?.orderId || context?.authorization?.orderId;
  const resolvedOrderRevisionId = pendingPayment?.orderRevisionId
    || context?.authorization?.orderRevisionId
    || null;
  const amount = pendingPayment?.amount ?? context?.amount;
  const currency = pendingPayment?.currency || context?.currency;
  if (!resolvedOrderId || !Number.isInteger(amount) || !currency) {
    return null;
  }
  const resolvedPendingPayment = pendingPayment || {
    orderId: resolvedOrderId,
    amount,
    currency,
    transactionId,
    authorizationId: context.authorization.id,
    orderRevisionId: context.authorization.orderRevisionId || null,
    paymentFlow: context.authorization.paymentFlow || "authorization",
    source: "database"
  };
  const paymentFlow = pendingPayment?.paymentFlow
    || context?.authorization?.paymentFlow
    || "authorization";

  if (paymentFlow === "direct_repayment") {
    if (context?.authorization?.status === "captured") {
      return {
        authorization: context.authorization,
        payload: { returnCode: "already_captured" },
        paymentFlow,
        pendingPayment: resolvedPendingPayment
      };
    }
    if (context?.authorization?.status && context.authorization.status !== "pending") {
      return {
        error: "repayment_not_pending",
        authorization: context.authorization,
        paymentFlow,
        pendingPayment: resolvedPendingPayment
      };
    }

    const repayment = getManualLinePayRepaymentContext(resolvedOrderId);
    const currentRepaymentIsPending = repayment?.reason === "repayment_already_pending"
      && repayment.latestRepayment?.id === resolvedPendingPayment.authorizationId;
    if (!repayment || (!repayment.eligible && !currentRepaymentIsPending)) {
      cancelPendingLinePayAuthorizationInDatabase({
        orderId: resolvedOrderId,
        providerTransactionId: transactionId,
        reason: repayment?.reason || "manual_repayment_not_available"
      });
      deletePendingLinePayPayment({ orderId: resolvedOrderId, transactionId });
      return {
        error: repayment?.reason || "manual_repayment_not_available",
        paymentFlow,
        manualRepayment: repayment,
        pendingPayment: resolvedPendingPayment
      };
    }

    const payload = await confirmLinePayPayment(transactionId, { amount, currency });
    const repaymentResult = completeManualLinePayRepaymentInDatabase({
      orderId: resolvedOrderId,
      providerTransactionId: transactionId,
      amount,
      providerCaptureId: transactionId,
      providerPayload: payload
    });
    deletePendingLinePayPayment({ orderId: resolvedOrderId, transactionId });
    return {
      ...repaymentResult,
      paymentFlow,
      payload,
      pendingPayment: resolvedPendingPayment
    };
  }

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

  const confirmProviderPayment = providerConfirmer || confirmLinePayPayment;
  const payload = await confirmProviderPayment(transactionId, {
    amount,
    currency
  });
  const confirmationInput = {
    orderId: resolvedOrderId,
    orderRevisionId: resolvedOrderRevisionId,
    providerTransactionId: transactionId,
    amount,
    providerPayload: payload
  };
  const authorizationResult = authorizationConfirmRepository
    ? await authorizationConfirmRepository.confirmAuthorization(confirmationInput)
    : authorizeLinePayPaymentInDatabase(confirmationInput);
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
        voidResult = authorizationConfirmRepository?.kind === "postgres"
          ? await compensateRejectedPostgresAuthorization({
              repository: authorizationConfirmRepository,
              orderId: resolvedOrderId,
              transactionId,
              reason: `${authorizationResult.error}_at_confirm`,
              providerVoider
            })
          : await voidLinePayAuthorization({
              orderId: resolvedOrderId,
              transactionId,
              reason: `${authorizationResult.error}_at_confirm`
            });
      } catch (error) {
        try {
          const failureInput = {
            orderId: resolvedOrderId,
            providerTransactionId: transactionId,
            reason: `${authorizationResult.error}_at_confirm_void_failed`,
            providerPayload: error.linePayPayload || { message: error.message }
          };
          if (authorizationConfirmRepository?.kind === "postgres") {
            await authorizationConfirmRepository.recordCompensatingVoidFailure(failureInput);
          } else {
            recordLinePayVoidFailureInDatabase(failureInput);
          }
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

async function compensateRejectedPostgresAuthorization({
  repository,
  orderId,
  transactionId,
  reason,
  providerVoider
}) {
  const voidProviderPayment = providerVoider || voidLinePayPaymentAuthorization;
  const payload = await voidProviderPayment(transactionId);
  const authorization = await repository.recordCompensatingVoidSuccess({
    orderId,
    providerTransactionId: transactionId,
    reason,
    providerPayload: payload
  });
  return { authorization, payload, status: "authorization_voided" };
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

async function captureLinePayAuthorization(input) {
  return withLinePayOperationLock(input, () => captureLinePayAuthorizationUnlocked(input));
}

async function captureLinePayAuthorizationUnlocked({
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
    const classification = classifyLinePayCaptureError(error);
    let captureFailure = null;
    try {
      captureFailure = recordLinePayCaptureFailureInDatabase({
        orderId: authorization.orderId,
        providerTransactionId: resolvedTransactionId,
        provider,
        amount: captureAmount,
        finalAmount: resolvedFinalAmount,
        reason: `${reason}_failed`,
        retryable: classification.retryable,
        providerPayload: error.linePayPayload || { message: error.message }
      });
    } catch {
      // Keep the original LINE Pay capture error visible to the caller.
    }
    error.captureFailure = captureFailure;
    error.captureClassification = classification;
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

async function refundLinePayPayment(input = {}) {
  const lockInput = {
    orderId: input.body?.orderId || input.body?.paymentCaptureId || input.body?.providerTransactionId
  };
  return withLinePayOperationLock(lockInput, () => refundLinePayPaymentUnlocked(input));
}

async function refundLinePayPaymentUnlocked({ authUser, body } = {}) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }
  if (!body?.orderId && !body?.captureId && !body?.providerTransactionId) {
    throw new PaymentServiceError(400, {
      error: "Missing required field: orderId, captureId, or providerTransactionId"
    });
  }

  const provider = resolveRefundProvider(body.provider);
  const pendingRefund = createPendingLinePayRefundInDatabase({
    orderId: body.orderId,
    captureId: body.captureId,
    providerTransactionId: body.providerTransactionId,
    provider,
    refundAmount: body.refundAmount ?? body.amount,
    idempotencyKey: body.idempotencyKey,
    reason: body.reason || "line_pay_refund_requested",
    actorUserId: authUser.id
  });

  if (!pendingRefund) {
    throw new PaymentServiceError(404, { error: "Captured payment not found" });
  }
  if (pendingRefund.error) {
    throw new PaymentServiceError(refundErrorStatusCode(pendingRefund.error), {
      error: refundErrorMessage(pendingRefund.error),
      status: pendingRefund.error,
      ...pendingRefund
    });
  }
  if (pendingRefund.alreadyExists) {
    const existingStatus = pendingRefund.refund?.status;
    if (existingStatus === "refunded") {
      return {
        ...pendingRefund,
        status: "refunded",
        idempotent: true
      };
    }
    throw new PaymentServiceError(409, {
      error: existingStatus === "pending"
        ? "Refund is already pending"
        : "Refund request already failed; use a new idempotency key to retry",
      status: existingStatus === "pending" ? "refund_already_pending" : "refund_already_failed",
      refund: pendingRefund.refund
    });
  }

  const transactionId = pendingRefund.authorization?.providerAuthorizationId;
  if (!transactionId) {
    const failed = failLinePayRefundInDatabase({
      refundId: pendingRefund.refund.id,
      reason: "provider_transaction_missing",
      actorUserId: authUser.id
    });
    throw new PaymentServiceError(409, {
      error: "LINE Pay transaction ID is missing",
      status: "provider_transaction_missing",
      refund: failed?.refund || pendingRefund.refund
    });
  }

  let payload;
  try {
    payload = provider === "mock_line_pay"
      ? createMockLinePayRefundPayload(transactionId, pendingRefund.refund.refundAmount)
      : await refundLinePayPaymentTransaction(transactionId, {
          refundAmount: pendingRefund.refund.refundAmount
        });
  } catch (error) {
    const failed = failLinePayRefundInDatabase({
      refundId: pendingRefund.refund.id,
      reason: "line_pay_refund_failed",
      actorUserId: authUser.id,
      providerPayload: error.linePayPayload || { message: error.message }
    });
    throw new PaymentServiceError(error.statusCode || 502, {
      error: "LINE Pay refund failed",
      status: "refund_failed",
      refund: failed?.refund || pendingRefund.refund,
      providerError: error.linePayPayload || { message: error.message }
    });
  }

  const completedRefund = completeLinePayRefundInDatabase({
    refundId: pendingRefund.refund.id,
    providerRefundId: payload.info?.refundTransactionId ? String(payload.info.refundTransactionId) : null,
    providerPayload: payload,
    actorUserId: authUser.id
  });

  if (completedRefund?.error) {
    throw new PaymentServiceError(409, completedRefund);
  }

  return {
    ...completedRefund,
    provider,
    providerTransactionId: transactionId,
    payload
  };
}

function resolveRefundProvider(provider) {
  if (provider == null || provider === "") return "line_pay";
  if (provider === "mock_line_pay" && process.env.NODE_ENV !== "production") {
    return "mock_line_pay";
  }
  if (provider === "line_pay") return "line_pay";
  throw new PaymentServiceError(400, { error: "Invalid refund provider" });
}

function refundErrorStatusCode(error) {
  const statusCodes = {
    captured_payment_not_found: 404,
    invalid_refund_amount: 400,
    refund_amount_exceeds_remaining_amount: 409,
    already_fully_refunded: 409
  };
  return statusCodes[error] || 409;
}

function refundErrorMessage(error) {
  const messages = {
    captured_payment_not_found: "Captured payment not found",
    invalid_refund_amount: "Refund amount must be a positive integer",
    refund_amount_exceeds_remaining_amount: "Refund amount exceeds the remaining refundable amount",
    already_fully_refunded: "Payment is already fully refunded"
  };
  return messages[error] || "Refund cannot be created";
}

async function voidLinePayAuthorization(input) {
  const repository = input.authorizationCancelRepository;
  const operation = () => voidLinePayAuthorizationUnlocked(input);
  if (input.operationLockHeld) return operation();
  if (repository?.kind === "postgres") {
    try {
      return await repository.withOperationLock(input, operation);
    } catch (error) {
      if (error?.code === "operation_locked") {
        throw new PaymentServiceError(409, {
          error: "payment_operation_locked",
          status: "retry_later",
          lockKey: error.lock?.lockKey || null,
          lockedUntil: error.lock?.lockedUntil || null
        });
      }
      throw error;
    }
  }
  return withLinePayOperationLock(input, operation);
}

async function voidLinePayAuthorizationUnlocked({
  transactionId,
  orderId,
  provider = "line_pay",
  reason = "line_pay_void_authorization",
  authorizationCancelRepository,
  providerVoider
}) {
  const contextInput = {
    orderId,
    providerTransactionId: transactionId,
    provider
  };
  const context = authorizationCancelRepository
    ? await authorizationCancelRepository.getAuthorizationContext(contextInput)
    : getLinePayAuthorizationContext(contextInput);

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

  let payload;
  try {
    const voidProviderPayment = providerVoider || voidLinePayPaymentAuthorization;
    payload = provider === "mock_line_pay"
      ? createMockLinePayPayload("mock_void", resolvedTransactionId, authorization.orderId)
      : await voidProviderPayment(resolvedTransactionId);
  } catch (error) {
    const failureInput = {
      orderId: authorization.orderId,
      providerTransactionId: resolvedTransactionId,
      provider,
      reason: reason + "_void_failed",
      providerPayload: error.linePayPayload || { message: error.message }
    };
    try {
      if (authorizationCancelRepository) {
        await authorizationCancelRepository.recordVoidFailure(failureInput);
      } else {
        recordLinePayVoidFailureInDatabase(failureInput);
      }
    } catch {
      // Keep the provider error visible to the caller.
    }
    throw error;
  }
  const persistenceInput = {
    orderId: authorization.orderId,
    providerTransactionId: resolvedTransactionId,
    provider,
    reason,
    providerPayload: payload
  };
  const voidedAuthorization = authorizationCancelRepository
    ? await authorizationCancelRepository.voidAuthorization(persistenceInput)
    : voidLinePayAuthorizationInDatabase(persistenceInput);

  if (voidedAuthorization?.error) {
    throw new PaymentServiceError(409, voidedAuthorization);
  }

  return {
    authorization: voidedAuthorization,
    payload,
    status: "authorization_voided"
  };
}

async function cancelLinePayAuthorization(input = {}) {
  const repository = input.authorizationCancelRepository;
  const lockResourceId = input.orderId || input.transactionId;
  if (!lockResourceId) return cancelLinePayAuthorizationUnlocked(input);
  try {
    if (repository?.kind === "postgres") {
      return await repository.withOperationLock({
        orderId: input.orderId,
        transactionId: input.transactionId,
        leaseMs: 120_000,
        now: input.now
      }, () => cancelLinePayAuthorizationUnlocked(input));
    }
    return await withOperationLease({
      lockKey: `order:${lockResourceId}:payment-lifecycle`,
      leaseMs: 120_000,
      now: input.now
    }, () => cancelLinePayAuthorizationUnlocked(input));
  } catch (error) {
    if (error instanceof OperationLeaseError || error?.code === "operation_locked") {
      throw new PaymentServiceError(409, {
        error: "payment_operation_locked",
        status: "retry_later",
        lockKey: error.lock.lockKey,
        lockedUntil: error.lock.lockedUntil
      });
    }
    throw error;
  }
}

async function cancelLinePayAuthorizationUnlocked({
  transactionId,
  orderId,
  authorizationCancelRepository
}) {
  const pendingPayment = findPendingLinePayPayment({ orderId, transactionId });
  const context = pendingPayment
    ? null
    : await (authorizationCancelRepository
        ? authorizationCancelRepository.getAuthorizationContext({
            orderId,
            providerTransactionId: transactionId
          })
        : getLinePayAuthorizationContext({
            orderId,
            providerTransactionId: transactionId
          }));
  const resolvedOrderId = pendingPayment?.orderId || context?.authorization?.orderId || orderId;
  const resolvedTransactionId = pendingPayment?.transactionId
    || context?.authorization?.providerAuthorizationId
    || transactionId;
  const cancellationInput = {
    orderId: resolvedOrderId,
    providerTransactionId: resolvedTransactionId,
    reason: "line_pay_cancel_redirect"
  };
  const authorization = authorizationCancelRepository
    ? await authorizationCancelRepository.cancelPendingAuthorization(cancellationInput)
    : cancelPendingLinePayAuthorizationInDatabase(cancellationInput);

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
  classifyLinePayCaptureError,
  clearPendingLinePayAuthorizationsForOrderUpdate,
  confirmLinePayAuthorization,
  getLinePayCaptureProviderState,
  inferLinePayPaymentState,
  requestManualLinePayRepayment,
  requestLinePayAuthorization,
  refundLinePayPayment,
  voidLinePayAuthorization
};
