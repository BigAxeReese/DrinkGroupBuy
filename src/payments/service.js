const { randomUUID } = require("node:crypto");
const config = require("../config");
const { db } = require("../db");
const { getProvider } = require("./providers");

const payableStatuses = new Set(["created", "pending"]);
const finalStatuses = new Set(["paid", "failed", "cancelled", "refunded"]);

function now() {
  return Date.now();
}

function validateCheckout(input) {
  const amount = Number(input.amount);
  const currency = String(input.currency || "TWD").trim().toUpperCase();
  const orderNumber = String(input.orderNumber || "").trim();

  if (!orderNumber) throw new Error("orderNumber is required");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be an ISO-4217 code");

  return {
    orderNumber,
    amount,
    currency,
    description: String(input.description || "").trim().slice(0, 200),
    customerEmail: String(input.customerEmail || "").trim().slice(0, 120),
    returnUrl: String(input.returnUrl || config.baseUrl).trim(),
  };
}

function rowToOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    description: row.description,
    customerEmail: row.customer_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPayment(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    checkoutUrl: row.checkout_url,
    rawRequest: JSON.parse(row.raw_request || "{}"),
    rawResponse: JSON.parse(row.raw_response || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findOrderByNumber(orderNumber) {
  const row = db.prepare("SELECT * FROM orders WHERE order_number = ?").get(orderNumber);
  return row ? rowToOrder(row) : null;
}

function findPaymentById(paymentId) {
  const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  return row ? rowToPayment(row) : null;
}

function findPaymentByProviderPaymentId(provider, providerPaymentId) {
  const row = db
    .prepare("SELECT * FROM payments WHERE provider = ? AND provider_payment_id = ?")
    .get(provider, providerPaymentId);
  return row ? rowToPayment(row) : null;
}

function createOrderIfNeeded(checkout) {
  const existing = findOrderByNumber(checkout.orderNumber);
  if (existing) {
    if (existing.amount !== checkout.amount || existing.currency !== checkout.currency) {
      throw new Error("orderNumber already exists with a different amount or currency");
    }
    return existing;
  }

  const timestamp = now();
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO orders (
      id, order_number, amount, currency, status, description, customer_email, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `
  ).run(
    id,
    checkout.orderNumber,
    checkout.amount,
    checkout.currency,
    checkout.description,
    checkout.customerEmail,
    timestamp,
    timestamp
  );

  return findOrderByNumber(checkout.orderNumber);
}

async function createCheckout(input) {
  const checkout = validateCheckout(input);
  const providerName = config.payment.provider;
  const provider = getProvider(providerName);
  const order = createOrderIfNeeded(checkout);
  const timestamp = now();
  const paymentId = randomUUID();
  const rawRequest = {
    orderNumber: checkout.orderNumber,
    amount: checkout.amount,
    currency: checkout.currency,
    description: checkout.description,
    customerEmail: checkout.customerEmail,
    returnUrl: checkout.returnUrl,
  };

  db.prepare(
    `
    INSERT INTO payments (
      id, order_id, provider, amount, currency, status, raw_request, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)
  `
  ).run(
    paymentId,
    order.id,
    providerName,
    checkout.amount,
    checkout.currency,
    JSON.stringify(rawRequest),
    timestamp,
    timestamp
  );

  const payment = findPaymentById(paymentId);
  const providerResult = await provider.createPayment({
    payment,
    order,
    returnUrl: checkout.returnUrl,
  });

  db.prepare(
    `
    UPDATE payments
    SET provider_payment_id = ?, checkout_url = ?, status = ?, raw_response = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(
    providerResult.providerPaymentId || "",
    providerResult.checkoutUrl || "",
    providerResult.status || "pending",
    JSON.stringify(providerResult.rawResponse || {}),
    now(),
    paymentId
  );

  return {
    order,
    payment: findPaymentById(paymentId),
  };
}

function normalizePaymentStatus(status) {
  if (["paid", "failed", "cancelled", "refunded"].includes(status)) return status;
  return "pending";
}

function orderStatusFromPayment(status) {
  if (status === "paid") return "paid";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  return "pending";
}

function recordPaymentEvent({ provider, event, payload }) {
  try {
    db.prepare(
      `
      INSERT INTO payment_events (
        id, provider, event_id, payment_id, event_type, payload, received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      randomUUID(),
      provider,
      event.eventId,
      event.paymentId || "",
      event.eventType || "payment.updated",
      JSON.stringify(payload),
      now()
    );
    return true;
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return false;
    throw error;
  }
}

function applyPaymentEvent(providerName, event) {
  const payment =
    event.paymentId
      ? findPaymentById(event.paymentId)
      : findPaymentByProviderPaymentId(providerName, event.providerPaymentId);

  if (!payment) {
    throw new Error("payment not found for webhook event");
  }

  if (finalStatuses.has(payment.status) && payment.status !== "paid") {
    return payment;
  }

  if (!payableStatuses.has(payment.status) && payment.status !== "paid") {
    throw new Error(`payment is not payable from status: ${payment.status}`);
  }

  const nextPaymentStatus = normalizePaymentStatus(event.status);
  const nextOrderStatus = orderStatusFromPayment(nextPaymentStatus);
  const timestamp = now();

  db.prepare("UPDATE payments SET status = ?, updated_at = ? WHERE id = ?").run(
    nextPaymentStatus,
    timestamp,
    payment.id
  );
  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(
    nextOrderStatus,
    timestamp,
    payment.orderId
  );

  return findPaymentById(payment.id);
}

function handleWebhook(providerName, headers, rawBody) {
  const provider = getProvider(providerName);
  if (!provider.verifyWebhook({ headers, rawBody })) {
    const error = new Error("invalid webhook signature");
    error.status = 401;
    throw error;
  }

  const payload = JSON.parse(rawBody.toString("utf8"));
  const event = provider.normalizeWebhook(payload);
  if (!event.eventId) throw new Error("webhook eventId is required");

  const inserted = recordPaymentEvent({ provider: providerName, event, payload });
  if (!inserted) {
    return {
      duplicate: true,
      payment: event.paymentId ? findPaymentById(event.paymentId) : null,
    };
  }

  return {
    duplicate: false,
    payment: applyPaymentEvent(providerName, event),
  };
}

module.exports = {
  createCheckout,
  findPaymentById,
  handleWebhook,
};
