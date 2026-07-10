const {
  authorizeLinePayPaymentInDatabase,
  createPendingLinePayAuthorization,
  getLatestLinePayAuthorizationForOrder,
  getOrderPaymentContext
} = require("../db");
const { confirmLinePayPayment, requestLinePayPayment } = require("./linePayClient");
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

async function requestLinePayAuthorization({ authUser, body }) {
  const validationError = validateLinePayRequest(body);
  if (validationError) {
    throw new PaymentServiceError(400, { error: validationError });
  }

  const order = getOrderPaymentContext(body.orderId);
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

  const existingAuthorization = getLatestLinePayAuthorizationForOrder(body.orderId);
  if (order.paymentStatus === "authorized" || existingAuthorization?.status === "authorized") {
    throw new PaymentServiceError(409, {
      error: "Order is already authorized",
      status: "already_authorized",
      authorization: existingAuthorization
    });
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
    amount: Number(body.amount),
    providerTransactionId: transactionId
  });
  const pendingPayment = {
    orderId: body.orderId,
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
    transactionId,
    authorization,
    paymentUrl: info.paymentUrl,
    paymentAccessToken: info.paymentAccessToken,
    status: "payment_url_created"
  };
}

async function confirmLinePayAuthorization({ transactionId, orderId }) {
  const pendingPayment = findPendingLinePayPayment({ orderId, transactionId });
  if (!transactionId || !pendingPayment) {
    return null;
  }

  const payload = await confirmLinePayPayment(transactionId, {
    amount: pendingPayment.amount,
    currency: pendingPayment.currency
  });
  const authorization = authorizeLinePayPaymentInDatabase({
    orderId: pendingPayment.orderId,
    providerTransactionId: transactionId,
    amount: pendingPayment.amount,
    providerPayload: payload
  });
  deletePendingLinePayPayment({
    orderId: pendingPayment.orderId,
    transactionId
  });

  return { authorization, payload, pendingPayment };
}

function cancelLinePayAuthorization({ transactionId, orderId }) {
  deletePendingLinePayPayment({ orderId, transactionId });
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
  clearPendingLinePayAuthorizationsForOrderUpdate,
  confirmLinePayAuthorization,
  requestLinePayAuthorization
};
