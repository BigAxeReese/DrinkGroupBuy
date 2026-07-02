const http = require("node:http");
const {
  authorizeLinePayPaymentInDatabase,
  cancelGroupBuyActivity,
  createGroupBuyActivity,
  createOrder,
  createPendingLinePayAuthorization,
  getLatestLinePayAuthorizationForOrder,
  getOrderDetail,
  getOrderPaymentContext,
  getUserAuthProfileByLoginIdentifier,
  getUserAuthProfileById,
  listGroupBuyActivities
} = require("./db");
const { createAuthToken, getBearerToken, verifyAuthToken, verifyPassword } = require("./auth");
const { confirmLinePayPayment, requestLinePayPayment } = require("./linePayClient");

const port = Number(process.env.PORT ?? 3000);
const pendingLinePayPayments = new Map();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "drink-group-buy-backend" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      const loginIdentifier = body.phoneNumber || body.loginName || body.email;
      if (!loginIdentifier || !body.password) {
        sendJson(response, 400, { error: "phoneNumber or loginName and password are required" });
        return;
      }

      const user = getUserAuthProfileByLoginIdentifier(loginIdentifier);
      if (!user || !verifyPassword(body.password, user.passwordHash)) {
        sendJson(response, 401, { error: "Invalid phoneNumber/loginName or password" });
        return;
      }

      const token = createAuthToken(user);
      sendJson(response, 200, { token, user: toPublicUserResponse(user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/group-buy-activities") {
      sendJson(response, 200, { activities: listGroupBuyActivities() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/merchant/group-buy-activities") {
      const authUser = getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant")) {
        sendJson(response, 403, { error: "Merchant role required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateCreateActivity(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      if (!canManageStore(authUser, body.storeId)) {
        sendJson(response, 403, { error: "Store access denied" });
        return;
      }

      const activity = createGroupBuyActivity({
        ...body,
        createdByUserId: authUser.id
      });
      sendJson(response, 201, { activity });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      const authUser = getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("customer")) {
        sendJson(response, 403, { error: "Customer role required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateCreateOrder(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = createOrder({
        ...body,
        customerUserId: authUser.id
      });
      if (result?.error === "activity_not_found") {
        sendJson(response, 404, { error: "Group-buy activity not found" });
        return;
      }
      if (result?.error === "customer_not_found") {
        sendJson(response, 404, { error: "Customer not found" });
        return;
      }
      if (result?.error === "activity_not_joinable") {
        sendJson(response, 409, { error: "Group-buy activity is not joinable", status: result.status });
        return;
      }
      if (result?.error === "capacity_exceeded") {
        sendJson(response, 409, {
          error: "Group-buy activity capacity exceeded",
          maximumCups: result.maximumCups,
          authorizedCups: result.authorizedCups,
          requestedCups: result.requestedCups
        });
        return;
      }

      sendJson(response, 201, { order: result.order });
      return;
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      const authUser = getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const order = getOrderDetail(orderMatch[1]);
      if (!order) {
        sendJson(response, 404, { error: "Order not found" });
        return;
      }
      if (!canAccessOrder(authUser, order)) {
        sendJson(response, 403, { error: "Order access denied" });
        return;
      }

      sendJson(response, 200, { order });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/line-pay/request") {
      const authUser = getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateLinePayRequest(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const order = getOrderPaymentContext(body.orderId);
      if (!order) {
        sendJson(response, 404, {
          error: "Order not found in backend database",
          nextStep: "Create the order in the backend before requesting LINE Pay authorization."
        });
        return;
      }
      if (order.customerUserId !== authUser.id && !authUser.roles.includes("admin")) {
        sendJson(response, 403, { error: "Order access denied" });
        return;
      }
      if (order.originalAmount !== Number(body.amount)) {
        sendJson(response, 409, {
          error: "LINE Pay authorization amount does not match order original amount",
          orderOriginalAmount: order.originalAmount,
          requestedAmount: Number(body.amount)
        });
        return;
      }
      const existingAuthorization = getLatestLinePayAuthorizationForOrder(body.orderId);
      if (order.paymentStatus === "authorized" || existingAuthorization?.status === "authorized") {
        sendJson(response, 409, {
          error: "Order is already authorized",
          status: "already_authorized",
          authorization: existingAuthorization
        });
        return;
      }
      if (existingAuthorization?.status === "pending") {
        sendJson(response, 409, {
          error: "Order already has a pending LINE Pay authorization",
          status: "authorization_already_pending",
          authorization: existingAuthorization
        });
        return;
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

      pendingLinePayPayments.set(body.orderId, pendingPayment);
      if (transactionId) {
        pendingLinePayPayments.set(transactionId, pendingPayment);
      }

      sendJson(response, 201, {
        provider: "line_pay",
        orderId: body.orderId,
        transactionId,
        authorization,
        paymentUrl: info.paymentUrl,
        paymentAccessToken: info.paymentAccessToken,
        status: "payment_url_created"
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/payments/line-pay/confirm") {
      const transactionId = url.searchParams.get("transactionId");
      const orderId = url.searchParams.get("orderId");
      const pendingPayment = (transactionId && pendingLinePayPayments.get(transactionId))
        || (orderId && pendingLinePayPayments.get(orderId));

      if (!transactionId || !pendingPayment) {
        sendHtml(response, 409, buildLinePayResultPage({
          title: "LINE Pay 預授權無法完成",
          message: "找不到待確認的付款資料。請回到 App 重新發起預授權。"
        }));
        return;
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
      pendingLinePayPayments.delete(pendingPayment.orderId);
      pendingLinePayPayments.delete(transactionId);

      sendHtml(response, 200, buildLinePayResultPage({
        title: "LINE Pay 預授權完成",
        message: "目前僅完成授權，尚未正式請款。請回到 App 查看團購進度。",
        detail: `Order ID: ${pendingPayment.orderId}${authorization ? ` / Authorization: ${authorization.status}` : ""}`,
        rawCode: payload.returnCode
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/payments/line-pay/cancel") {
      const transactionId = url.searchParams.get("transactionId");
      const orderId = url.searchParams.get("orderId");
      if (transactionId) pendingLinePayPayments.delete(transactionId);
      if (orderId) pendingLinePayPayments.delete(orderId);

      sendHtml(response, 200, buildLinePayResultPage({
        title: "LINE Pay 預授權已取消",
        message: "你可以回到 App 重新發起預授權。"
      }));
      return;
    }

    const adminActivityMatch = url.pathname.match(/^\/api\/admin\/group-buy-activities\/([^/]+)$/);
    if (request.method === "DELETE" && adminActivityMatch) {
      const authUser = getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("admin")) {
        sendJson(response, 403, { error: "Admin role required" });
        return;
      }

      const body = await readJsonBody(request);
      const activity = cancelGroupBuyActivity(adminActivityMatch[1], {
        ...body,
        actorUserId: authUser.id
      });
      if (!activity) {
        sendJson(response, 404, { error: "Group-buy activity not found" });
        return;
      }

      sendJson(response, 200, { activity });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`DrinkGroupBuy backend listening on http://localhost:${port}`);
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  });

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function validateCreateActivity(body) {
  const requiredFields = [
    "storeId",
    "title",
    "startAt",
    "deadlineAt",
    "pickupStartAt",
    "pickupEndAt"
  ];
  const missingField = requiredFields.find((field) => !body[field]);
  if (missingField) return `Missing required field: ${missingField}`;

  if (body.tiers != null && !Array.isArray(body.tiers)) {
    return "tiers must be an array";
  }

  return null;
}

function validateCreateOrder(body) {
  if (!body.activityId) return "Missing required field: activityId";
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return "items must be a non-empty array";
  }
  if (
    body.fallbackPurchasePreference != null
    && !["decline_original_price", "accept_original_price"].includes(body.fallbackPurchasePreference)
  ) {
    return "fallbackPurchasePreference is invalid";
  }
  return null;
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

function getAuthenticatedUser(request) {
  const token = getBearerToken(request);
  const payload = verifyAuthToken(token);
  if (!payload?.sub) return null;
  return getUserAuthProfileById(payload.sub);
}

function canAccessOrder(user, order) {
  if (user.roles.includes("admin")) return true;
  return order.customerUserId === user.id;
}

function canManageStore(user, storeId) {
  if (!storeId) return false;
  return user.merchantStores.some((store) => store.id === storeId);
}

function toPublicUserResponse(user) {
  return {
    id: user.id,
    loginName: user.loginName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    displayName: user.displayName,
    surname: user.surname,
    roles: user.roles,
    merchantStores: user.merchantStores
  };
}

function buildLinePayResultPage({ title, message, detail, rawCode }) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f1f5f9;
      color: #0f172a;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(420px, calc(100vw - 32px));
      border-radius: 24px;
      background: white;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.16);
      padding: 28px;
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 8px 0; line-height: 1.6; color: #334155; }
    .code { color: #2563eb; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detail ? `<p class="code">${escapeHtml(detail)}</p>` : ""}
    ${rawCode ? `<p>LINE Pay returnCode: ${escapeHtml(rawCode)}</p>` : ""}
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
