const { createHmac, randomUUID, timingSafeEqual } = require("node:crypto");
const config = require("../../config");

function sign(rawBody) {
  return createHmac("sha256", config.payment.webhookSecret).update(rawBody).digest("hex");
}

function safeEqualHex(expected, actual) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(String(actual || ""), "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

async function createPayment({ payment, order, returnUrl }) {
  const providerPaymentId = `mock_${randomUUID()}`;
  return {
    providerPaymentId,
    checkoutUrl: `${config.baseUrl}/mock/checkout/${payment.id}?returnUrl=${encodeURIComponent(returnUrl || "")}`,
    status: "pending",
    rawResponse: {
      providerPaymentId,
      orderNumber: order.orderNumber,
    },
  };
}

function verifyWebhook({ headers, rawBody }) {
  const signature = headers["x-bgb-signature"];
  return safeEqualHex(sign(rawBody), signature);
}

function normalizeWebhook(payload) {
  return {
    eventId: payload.eventId,
    eventType: payload.type,
    providerPaymentId: payload.providerPaymentId || "",
    paymentId: payload.paymentId || "",
    status: payload.status,
    occurredAt: payload.occurredAt || Date.now(),
    raw: payload,
  };
}

function buildSignedWebhookBody(payload) {
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
  return {
    rawBody,
    headers: {
      "x-bgb-signature": sign(rawBody),
    },
  };
}

module.exports = {
  name: "mock",
  createPayment,
  verifyWebhook,
  normalizeWebhook,
  buildSignedWebhookBody,
};
