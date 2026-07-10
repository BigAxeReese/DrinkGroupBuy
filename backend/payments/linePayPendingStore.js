const pendingLinePayPayments = new Map();

function savePendingLinePayPayment(payment) {
  pendingLinePayPayments.set(payment.orderId, payment);
  if (payment.transactionId) {
    pendingLinePayPayments.set(payment.transactionId, payment);
  }
}

function findPendingLinePayPayment({ orderId, transactionId }) {
  return (transactionId && pendingLinePayPayments.get(transactionId))
    || (orderId && pendingLinePayPayments.get(orderId))
    || null;
}

function deletePendingLinePayPayment({ orderId, transactionId }) {
  if (orderId) pendingLinePayPayments.delete(orderId);
  if (transactionId) pendingLinePayPayments.delete(transactionId);
}

function clearPendingLinePayAuthorizationsForOrderUpdate(orderId, authorizations = []) {
  if (orderId) pendingLinePayPayments.delete(orderId);
  for (const authorization of authorizations) {
    if (authorization.providerAuthorizationId) {
      pendingLinePayPayments.delete(authorization.providerAuthorizationId);
    }
  }
}

module.exports = {
  clearPendingLinePayAuthorizationsForOrderUpdate,
  deletePendingLinePayPayment,
  findPendingLinePayPayment,
  savePendingLinePayPayment
};
