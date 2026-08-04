const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

loadLocalEnv(path.resolve(__dirname, "..", "..", ".env"));
loadLocalEnv(path.resolve(__dirname, "..", ".env"));

// Public ECPay stage credentials (safe to keep as fallback defaults; stage-only, no real funds):
// https://developers.ecpay.com.tw/?p=8981
const STAGE_MERCHANT_ID = "3002607";
const STAGE_HASH_KEY = "pwFHCqoQZGmho4w6";
const STAGE_HASH_IV = "EkRm7iFT261dpevs";

const DEFAULT_STAGE_CHECKOUT_BASE_URL = "https://payment-stage.ecpay.com.tw";
const DEFAULT_PRODUCTION_CHECKOUT_BASE_URL = "https://payment.ecpay.com.tw";

function getEcpayConfig() {
  const env = process.env.ECPAY_ENV || "stage";
  const isStage = env !== "production";

  return {
    env,
    checkoutBaseUrl: (process.env.ECPAY_CHECKOUT_BASE_URL
      || (isStage ? DEFAULT_STAGE_CHECKOUT_BASE_URL : DEFAULT_PRODUCTION_CHECKOUT_BASE_URL)).replace(/\/$/, ""),
    merchantId: process.env.ECPAY_MERCHANT_ID || (isStage ? STAGE_MERCHANT_ID : undefined),
    hashKey: process.env.ECPAY_HASH_KEY || (isStage ? STAGE_HASH_KEY : undefined),
    hashIv: process.env.ECPAY_HASH_IV || (isStage ? STAGE_HASH_IV : undefined),
    returnUrl: process.env.ECPAY_RETURN_URL,
    clientBackUrl: process.env.ECPAY_CLIENT_BACK_URL
  };
}

function assertEcpayConfig(config) {
  const missing = [];
  if (!config.merchantId) missing.push("ECPAY_MERCHANT_ID");
  if (!config.hashKey) missing.push("ECPAY_HASH_KEY");
  if (!config.hashIv) missing.push("ECPAY_HASH_IV");
  if (!config.returnUrl) missing.push("ECPAY_RETURN_URL");
  if (!config.clientBackUrl) missing.push("ECPAY_CLIENT_BACK_URL");

  if (missing.length > 0) {
    throw new Error(`Missing ECPay environment variables: ${missing.join(", ")}`);
  }
}

// Builds the AioCheckOut/V2 form fields for redirecting the customer to ECPay's hosted
// checkout page. Reference: https://developers.ecpay.com.tw/?p=2856
// This only produces the request fields; the caller renders them as an auto-submitting
// HTML form (ECPay's checkout is a POST redirect, not a single GET URL like LINE Pay).
function buildEcpayCheckoutForm(input) {
  const config = getEcpayConfig();
  assertEcpayConfig(config);

  const merchantTradeNo = requiredString(input.merchantTradeNo, "merchantTradeNo");
  const amount = toPositiveInteger(input.amount, "amount");
  const itemName = requiredString(input.itemName, "itemName");
  const tradeDesc = input.tradeDesc || "DrinkGroupBuy preorder";
  const backendOrderId = requiredString(input.orderId, "orderId");

  const fields = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatEcpayDateTime(new Date()),
    PaymentType: "aio",
    TotalAmount: amount,
    TradeDesc: tradeDesc,
    ItemName: itemName,
    ReturnURL: appendQuery(config.returnUrl, { orderId: backendOrderId }),
    ChoosePayment: "Credit",
    ClientBackURL: appendQuery(config.clientBackUrl, { orderId: backendOrderId }),
    EncryptType: 1
  };
  fields.CheckMacValue = computeEcpayCheckMacValue(fields, config);

  return {
    action: `${config.checkoutBaseUrl}/Cashier/AioCheckOut/V5`,
    fields
  };
}

// Capture ("close"), void ("cancel"), and refund all go through the same DoAction
// endpoint with a different Action code. Reference: https://developers.ecpay.com.tw/2885/
// NOTE: field shape below is best-effort from public documentation, not yet verified
// byte-for-byte against a live stage response — confirm against docs/ecpay-checkout-stage-checklist.md
// before trusting this in a real flow.
async function doEcpayCreditCardAction({ merchantTradeNo, tradeNo, action, amount }) {
  const config = getEcpayConfig();
  assertEcpayConfig(config);

  const fields = {
    MerchantID: config.merchantId,
    MerchantTradeNo: requiredString(merchantTradeNo, "merchantTradeNo"),
    TradeNo: requiredString(tradeNo, "tradeNo"),
    Action: requiredString(action, "action"),
    TotalAmount: toPositiveInteger(amount, "amount")
  };
  fields.CheckMacValue = computeEcpayCheckMacValue(fields, config);

  const response = await fetch(`${config.checkoutBaseUrl}/CreditDetail/DoAction`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString()
  });

  const payload = await parseEcpayFormResponse(response);
  if (!response.ok || payload.RtnCode !== "1") {
    const reason = payload.RtnMsg || response.statusText;
    const error = new Error(`ECPay DoAction failed: ${reason}`);
    error.statusCode = response.status || 502;
    error.ecpayPayload = payload;
    throw error;
  }

  return payload;
}

async function closeEcpayCreditCardAuthorization({ merchantTradeNo, tradeNo, amount }) {
  return doEcpayCreditCardAction({ merchantTradeNo, tradeNo, amount, action: "C" });
}

async function cancelEcpayCreditCardAuthorization({ merchantTradeNo, tradeNo, amount }) {
  return doEcpayCreditCardAction({ merchantTradeNo, tradeNo, amount, action: "E" });
}

async function refundEcpayPayment({ merchantTradeNo, tradeNo, amount }) {
  return doEcpayCreditCardAction({ merchantTradeNo, tradeNo, amount, action: "R" });
}

// Verifies the CheckMacValue on an incoming ReturnURL webhook payload. Returns true/false;
// callers must reject the request (without touching any state) when this returns false.
function verifyEcpayCheckMacValue(formBody) {
  const config = getEcpayConfig();
  assertEcpayConfig(config);

  const { CheckMacValue: receivedMac, ...fields } = formBody;
  if (!receivedMac) return false;

  const expectedMac = computeEcpayCheckMacValue(fields, config);
  return typeof receivedMac === "string" && receivedMac.toUpperCase() === expectedMac;
}

// CheckMacValue algorithm (https://developers.ecpay.com.tw/2902/):
// 1. sort params A-Z by key, join as key=value&key=value
// 2. prepend HashKey=..., append &HashIV=...
// 3. URL-encode the whole string using ECPay's .NET-style rules, lowercase it
// 4. SHA256 hash, uppercase the hex digest
function computeEcpayCheckMacValue(fields, config) {
  const sortedEntries = Object.keys(fields)
    .filter((key) => key !== "CheckMacValue")
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((key) => `${key}=${fields[key]}`);

  const raw = `HashKey=${config.hashKey}&${sortedEntries.join("&")}&HashIV=${config.hashIv}`;
  const encoded = ecpayUrlEncode(raw).toLowerCase();
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

// ECPay expects .NET's Server.UrlEncode() character conventions, which differ from
// encodeURIComponent for a handful of characters. Reference: https://developers.ecpay.com.tw/2902/
function ecpayUrlEncode(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/%21/g, "!")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2A/gi, "*")
    .replace(/%2D/gi, "-")
    .replace(/%2E/gi, ".")
    .replace(/%5F/gi, "_");
}

function formatEcpayDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function parseEcpayFormResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  // ECPay's DoAction response is form-encoded key=value pairs, not JSON.
  if (text.includes("=")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    return JSON.parse(text);
  } catch {
    return { RtnMsg: text };
  }
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
  buildEcpayCheckoutForm,
  cancelEcpayCreditCardAuthorization,
  closeEcpayCreditCardAuthorization,
  computeEcpayCheckMacValue,
  getEcpayConfig,
  refundEcpayPayment,
  verifyEcpayCheckMacValue
};
