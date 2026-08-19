import Constants from "expo-constants";
import { Platform } from "react-native";
import { fetchWithTimeout } from "./fetchWithTimeout";

// 10.0.2.2 is the Android emulator's alias for the host machine's localhost;
// it only resolves inside the emulator's virtual network, so web/browser
// contexts need a plain localhost default instead.
const defaultBackendUrl = Platform.OS === "web" ? "http://localhost:3001" : "http://10.0.2.2:3001";
const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL
  || Constants.expoConfig?.extra?.backendBaseUrl
  || Constants.manifest2?.extra?.expoClient?.extra?.backendBaseUrl
  || defaultBackendUrl;
const authMode = process.env.EXPO_PUBLIC_AUTH_MODE
  || Constants.expoConfig?.extra?.authMode
  || Constants.manifest2?.extra?.expoClient?.extra?.authMode
  || "firebase";

const inflightRequests = new Map();
let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export async function login(input) {
  const response = await fetch(`${backendBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      phoneNumber: input.phoneNumber,
      loginName: input.loginName ?? input.email,
      password: input.password
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Login failed");
  }

  setAuthToken(payload.token);
  return payload;
}

export async function loginWithFirebaseIdToken(idToken) {
  const response = await fetch(`${backendBaseUrl}/api/auth/firebase-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ idToken })
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Firebase login failed");
    error.payload = payload;
    throw error;
  }

  setAuthToken(payload.token);
  return payload;
}

export async function listDevAuthUsers() {
  const response = await fetch(`${backendBaseUrl}/api/auth/dev-users`);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "List dev users failed");
    error.payload = payload;
    throw error;
  }

  return payload.users;
}

export async function loginWithDevUser(userId) {
  const response = await fetch(`${backendBaseUrl}/api/auth/dev-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Dev login failed");
    error.payload = payload;
    throw error;
  }

  setAuthToken(payload.token);
  return payload;
}

export async function getDevBusinessTime() {
  const response = await fetchWithTimeout(`${backendBaseUrl}/api/dev/business-time`, {
    timeoutMs: 2500,
    timeoutMessage: "開發業務時間同步逾時"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message ?? payload.error ?? "Get dev business time failed");
    error.payload = payload;
    throw error;
  }
  return payload.businessTime;
}

export async function createGroupBuyActivity(input) {
  const requestKey = `createGroupBuyActivity:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const idempotencyKey = input.idempotencyKey ?? requestKey;
    const response = await fetch(`${backendBaseUrl}/api/merchant/group-buy-activities`, {
      method: "POST",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        ...input,
        idempotencyKey
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error ?? "Create group-buy activity failed");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload.activity;
  });
}

export async function listGroupBuyActivities() {
  const requestKey = "listGroupBuyActivities";
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/group-buy-activities`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "List group-buy activities failed");
    }

    return payload.activities;
  });
}

export async function listStores() {
  const requestKey = "listStores";
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/stores`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "List stores failed");
    }

    return payload.stores;
  });
}

export async function getStoreMenu(storeId) {
  return getMenuRequest(`/api/stores/${encodeURIComponent(storeId)}/menu`, false);
}

export async function listCustomerOrders(input = {}) {
  return getOrderListRequest("/api/customers/me/orders", input);
}

export async function listMerchantStoreOrders(storeId, input = {}) {
  return getOrderListRequest(`/api/merchant/stores/${encodeURIComponent(storeId)}/orders`, input);
}

async function getOrderListRequest(path, input) {
  const query = new URLSearchParams();
  query.set("scope", input.scope === "history" ? "history" : "active");
  if (input.activityId) query.set("activityId", input.activityId);
  if (input.cursor) query.set("cursor", input.cursor);
  query.set("limit", String(input.limit || 20));
  const response = await fetch(`${backendBaseUrl}${path}?${query}`, { headers: withAuthHeaders() });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Get order list failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function getMerchantStoreMenu(storeId) {
  return getMenuRequest(`/api/merchant/stores/${encodeURIComponent(storeId)}/menu`, true);
}

export async function createMerchantMenuItem(storeId, input) {
  return writeMenuItemRequest(
    `/api/merchant/stores/${encodeURIComponent(storeId)}/menu-items`,
    "POST",
    input
  );
}

export async function updateMerchantMenuItem(storeId, menuItemId, input) {
  return writeMenuItemRequest(
    `/api/merchant/stores/${encodeURIComponent(storeId)}/menu-items/${encodeURIComponent(menuItemId)}`,
    "PATCH",
    input
  );
}

async function getMenuRequest(path, authenticated) {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    headers: authenticated ? withAuthHeaders() : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Get store menu failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function writeMenuItemRequest(path, method, body) {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method,
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Save menu item failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.menuItem;
}

export async function deleteGroupBuyActivity(activityId, input = {}) {
  const requestKey = `deleteGroupBuyActivity:${activityId}:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/admin/group-buy-activities/${activityId}`, {
      method: "DELETE",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Delete group-buy activity failed");
    }

    return payload.activity;
  });
}

export async function createOrder(input) {
  const requestKey = `createOrder:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/orders`, {
      method: "POST",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(getOrderWriteErrorMessage(payload, "Create order failed"));
      error.payload = payload;
      throw error;
    }

    return payload.order;
  });
}

export async function getOrder(orderId) {
  const requestKey = `getOrder:${orderId}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/orders/${encodeURIComponent(orderId)}`, {
      headers: withAuthHeaders()
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Get order failed");
    }

    return payload.order;
  });
}

export async function updateOrder(orderId, input) {
  const requestKey = `updateOrder:${orderId}:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(getOrderWriteErrorMessage(payload, "Update order failed"));
      error.payload = payload;
      throw error;
    }

    return payload.order;
  });
}

export async function createOrderRevision(orderId, input) {
  const requestKey = `createOrderRevision:${orderId}:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/orders/${encodeURIComponent(orderId)}/revisions`, {
      method: "POST",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(getOrderWriteErrorMessage(payload, "Create order revision failed"));
      error.payload = payload;
      throw error;
    }

    return payload.revision;
  });
}

export async function cancelOrder(orderId, input) {
  const response = await fetch(`${backendBaseUrl}/api/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Cancel order failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.order;
}

export async function cancelMerchantGroupBuyActivity(activityId, input) {
  const response = await fetch(
    `${backendBaseUrl}/api/merchant/group-buy-activities/${encodeURIComponent(activityId)}/cancel`,
    {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Cancel group-buy activity failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function getPickupOverdueRule() {
  const response = await fetch(`${backendBaseUrl}/api/payment-rules/pickup-overdue`, {
    headers: withAuthHeaders()
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Pickup overdue rule load failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.rule;
}

export async function requestLinePayAuthorization(input) {
  const requestKey = `requestLinePayAuthorization:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/payments/line-pay/request`, {
      method: "POST",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error ?? "LINE Pay authorization request failed");
      error.payload = payload;
      throw error;
    }

    return payload;
  });
}

export async function requestEcpayAuthorization(input) {
  const requestKey = `requestEcpayAuthorization:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/payments/ecpay/request`, {
      method: "POST",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error ?? "ECPay authorization request failed");
      error.payload = payload;
      throw error;
    }

    return payload;
  });
}

export async function requestLinePayRepayment(input) {
  const requestKey = `requestLinePayRepayment:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/payments/line-pay/repay`, {
      method: "POST",
      headers: withAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error ?? "LINE Pay repayment request failed");
      error.payload = payload;
      throw error;
    }

    return payload;
  });
}

export async function markGroupBuyActivityReadyForPickup(activityId) {
  return postPickupRequest(
    `/api/merchant/group-buy-activities/${encodeURIComponent(activityId)}/ready-for-pickup`
  );
}

export async function lookupPickupCredential(pickupCode) {
  return postPickupRequest("/api/merchant/pickup-credentials/lookup", { pickupCode });
}

export async function redeemPickupCredential(pickupCode) {
  return postPickupRequest("/api/merchant/pickup-credentials/redeem", { pickupCode });
}

export async function getPickupCredential(orderId) {
  const response = await fetch(
    `${backendBaseUrl}/api/orders/${encodeURIComponent(orderId)}/pickup-credential`,
    { headers: withAuthHeaders() }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Get pickup credential failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.credential;
}

export async function createMerchantRefundRequest(orderId, input) {
  const response = await fetch(
    `${backendBaseUrl}/api/merchant/orders/${encodeURIComponent(orderId)}/refund-requests`,
    {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Create refund request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function listMerchantRefundRequests(storeId, input = {}) {
  const query = input.status ? `?status=${encodeURIComponent(input.status)}` : "";
  const response = await fetch(
    `${backendBaseUrl}/api/merchant/stores/${encodeURIComponent(storeId)}/refund-requests${query}`,
    { headers: withAuthHeaders() }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "List refund requests failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.refundRequests;
}

export async function listAdminRefundRequests(input = {}) {
  const query = input.status ? `?status=${encodeURIComponent(input.status)}` : "";
  const response = await fetch(
    `${backendBaseUrl}/api/admin/refund-requests${query}`,
    { headers: withAuthHeaders() }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "List refund requests failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.refundRequests;
}

export async function approveAdminRefundRequest(requestId, input = {}) {
  const response = await fetch(
    `${backendBaseUrl}/api/admin/refund-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Approve refund request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function rejectAdminRefundRequest(requestId, input) {
  const response = await fetch(
    `${backendBaseUrl}/api/admin/refund-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Reject refund request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function postPickupRequest(path, body) {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: "POST",
    headers: withAuthHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? "Pickup request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function dedupeRequest(key, requestFn) {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const requestPromise = requestFn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, requestPromise);
  return requestPromise;
}

function getOrderWriteErrorMessage(payload, fallback) {
  if (payload?.error === "order_price_changed") {
    return "菜單價格已更新，請重新確認購物車金額後再送出。";
  }
  if (payload?.error === "order_items_invalid") {
    return "飲品、供應狀態或客製化選項已變更，請重新選擇後再送出。";
  }
  return payload?.error ?? fallback;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function withAuthHeaders(headers = {}) {
  return authToken
    ? {
        ...headers,
        Authorization: `Bearer ${authToken}`
      }
    : headers;
}

export function getBackendBaseUrl() {
  return backendBaseUrl;
}

export function getAuthMode() {
  return authMode;
}
