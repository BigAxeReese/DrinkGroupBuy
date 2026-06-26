const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

loadLocalEnv(path.resolve(__dirname, "..", ".env"));
loadLocalEnv(path.resolve(__dirname, ".env"));

const DEFAULT_SANDBOX_BASE_URL = "https://sandbox-api-pay.line.me";
const DEFAULT_PRODUCTION_BASE_URL = "https://api-pay.line.me";

function getLinePayConfig() {
  const env = process.env.LINE_PAY_ENV || "sandbox";
  const baseUrl = process.env.LINE_PAY_API_BASE_URL
    || (env === "production" ? DEFAULT_PRODUCTION_BASE_URL : DEFAULT_SANDBOX_BASE_URL);

  return {
    env,
    baseUrl: baseUrl.replace(/\/$/, ""),
    channelId: process.env.LINE_PAY_CHANNEL_ID,
    channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
    currency: process.env.LINE_PAY_CURRENCY || "TWD",
    confirmUrl: process.env.LINE_PAY_CONFIRM_URL,
    cancelUrl: process.env.LINE_PAY_CANCEL_URL
  };
}

function assertLinePayConfig(config) {
  const missing = [];
  if (!config.channelId) missing.push("LINE_PAY_CHANNEL_ID");
  if (!config.channelSecret) missing.push("LINE_PAY_CHANNEL_SECRET");
  if (!config.confirmUrl) missing.push("LINE_PAY_CONFIRM_URL");
  if (!config.cancelUrl) missing.push("LINE_PAY_CANCEL_URL");

  if (missing.length > 0) {
    throw new Error(`Missing LINE Pay environment variables: ${missing.join(", ")}`);
  }
}

async function requestLinePayPayment(input) {
  const config = getLinePayConfig();
  assertLinePayConfig(config);

  const amount = toPositiveInteger(input.amount, "amount");
  const currency = input.currency || config.currency;
  const orderId = requiredString(input.orderId, "orderId");
  const productName = input.productName || "DrinkGroupBuy preorder";
  const packageName = input.packageName || "DrinkGroupBuy";
  const packageId = input.packageId || orderId;

  const products = Array.isArray(input.products) && input.products.length > 0
    ? input.products.map((product, index) => ({
        name: requiredString(product.name || productName, `products[${index}].name`),
        quantity: toPositiveInteger(product.quantity || 1, `products[${index}].quantity`),
        price: toPositiveInteger(product.price, `products[${index}].price`)
      }))
    : [{ name: productName, quantity: 1, price: amount }];

  const body = {
    amount,
    currency,
    orderId,
    packages: [
      {
        id: packageId,
        amount,
        name: packageName,
        products
      }
    ],
    redirectUrls: {
      confirmUrl: appendQuery(config.confirmUrl, { orderId }),
      cancelUrl: appendQuery(config.cancelUrl, { orderId })
    }
  };

  return linePayPost("/v3/payments/request", body, config);
}

async function confirmLinePayPayment(transactionId, input) {
  const config = getLinePayConfig();
  assertLinePayConfig(config);

  const amount = toPositiveInteger(input.amount, "amount");
  const currency = input.currency || config.currency;
  const encodedTransactionId = encodeURIComponent(requiredString(transactionId, "transactionId"));

  return linePayPost(`/v3/payments/${encodedTransactionId}/confirm`, { amount, currency }, config);
}

async function linePayPost(uri, body, config = getLinePayConfig()) {
  const nonce = crypto.randomUUID();
  const bodyText = JSON.stringify(body);
  const signature = signLinePayRequest({
    channelSecret: config.channelSecret,
    uri,
    bodyText,
    nonce
  });

  const response = await fetch(`${config.baseUrl}${uri}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LINE-ChannelId": config.channelId,
      "X-LINE-Authorization-Nonce": nonce,
      "X-LINE-Authorization": signature
    },
    body: bodyText
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.returnCode !== "0000") {
    const reason = payload.returnMessage || payload.message || response.statusText;
    const error = new Error(`LINE Pay request failed: ${reason}`);
    error.statusCode = response.status || 502;
    error.linePayPayload = payload;
    throw error;
  }

  return payload;
}

function signLinePayRequest({ channelSecret, uri, bodyText, nonce }) {
  const signatureTarget = `${channelSecret}${uri}${bodyText}${nonce}`;
  return crypto
    .createHmac("sha256", channelSecret)
    .update(signatureTarget)
    .digest("base64");
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] != null) continue;

    process.env[key] = stripEnvQuotes(rawValue);
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function toPositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return number;
}

function appendQuery(url, query) {
  const parsedUrl = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    parsedUrl.searchParams.set(key, value);
  }
  return parsedUrl.toString();
}

module.exports = {
  confirmLinePayPayment,
  getLinePayConfig,
  requestLinePayPayment
};
