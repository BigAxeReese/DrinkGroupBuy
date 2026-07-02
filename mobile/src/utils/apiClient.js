import Constants from "expo-constants";

const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL
  || Constants.expoConfig?.extra?.backendBaseUrl
  || Constants.manifest2?.extra?.expoClient?.extra?.backendBaseUrl
  || "http://localhost:3000";

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
      throw new Error(payload.error ?? "Create group-buy activity failed");
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
      throw new Error(payload.error ?? "Create order failed");
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
