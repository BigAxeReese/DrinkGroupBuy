const { createServer } = require("node:http");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const config = require("./src/config");
require("./src/db");
const { readJson, readRawBody, sendJson, serveStatic } = require("./src/http");
const { createCheckout, findPaymentById, handleWebhook } = require("./src/payments/service");
const mockProvider = require("./src/payments/providers/mockProvider");

const publicDir = join(__dirname, "public");

function paymentIdFromPath(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length));
}

async function handleCreateCheckout(request, response) {
  try {
    const data = await readJson(request);
    const result = await createCheckout(data);
    sendJson(response, {
      orderId: result.order.id,
      paymentId: result.payment.id,
      status: result.payment.status,
      checkoutUrl: result.payment.checkoutUrl,
    }, 201);
  } catch (error) {
    sendJson(response, { error: error.message }, 400);
  }
}

function handleGetPayment(pathname, response) {
  const paymentId = paymentIdFromPath(pathname, "/api/payments/");
  const payment = findPaymentById(paymentId);
  if (!payment) {
    sendJson(response, { error: "payment not found" }, 404);
    return;
  }
  sendJson(response, payment);
}

async function handleProviderWebhook(providerName, request, response) {
  try {
    const rawBody = await readRawBody(request);
    const result = handleWebhook(providerName, request.headers, rawBody);
    sendJson(response, { ok: true, duplicate: result.duplicate });
  } catch (error) {
    sendJson(response, { error: error.message }, error.status || 400);
  }
}

async function handleMockSucceed(pathname, response) {
  const paymentId = paymentIdFromPath(pathname, "/api/mock/payments/").replace(/\/succeed$/, "");
  const payment = findPaymentById(paymentId);
  if (!payment) {
    sendJson(response, { error: "payment not found" }, 404);
    return;
  }

  const payload = {
    eventId: `evt_${randomUUID()}`,
    type: "payment.succeeded",
    paymentId: payment.id,
    providerPaymentId: payment.providerPaymentId,
    status: "paid",
    occurredAt: Date.now(),
  };
  const signed = mockProvider.buildSignedWebhookBody(payload);
  const result = handleWebhook("mock", signed.headers, signed.rawBody);
  sendJson(response, {
    ok: true,
    payment: result.payment,
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, {
      status: "ok",
      provider: config.payment.provider,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/checkout") {
    handleCreateCheckout(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/payments/")) {
    handleGetPayment(url.pathname, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/api/mock/payments/") &&
    url.pathname.endsWith("/succeed")
  ) {
    handleMockSucceed(url.pathname, response);
    return;
  }

  const webhookMatch = url.pathname.match(/^\/payments\/([^/]+)\/webhook$/);
  if (request.method === "POST" && webhookMatch) {
    handleProviderWebhook(webhookMatch[1], request, response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(publicDir, url.pathname, response);
    return;
  }

  sendJson(response, { error: "Method not allowed" }, 405);
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`BGB Payments is running at http://127.0.0.1:${config.port}`);
  console.log(`Payment provider: ${config.payment.provider}`);
});
