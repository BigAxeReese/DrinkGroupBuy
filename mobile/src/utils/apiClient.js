import Constants from "expo-constants";

const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL
  || Constants.expoConfig?.extra?.backendBaseUrl
  || Constants.manifest2?.extra?.expoClient?.extra?.backendBaseUrl
  || "http://localhost:3000";

const inflightRequests = new Map();

export async function createGroupBuyActivity(input) {
  const requestKey = `createGroupBuyActivity:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const idempotencyKey = input.idempotencyKey ?? requestKey;
    const response = await fetch(`${backendBaseUrl}/api/merchant/group-buy-activities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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

export async function deleteGroupBuyActivity(activityId, input = {}) {
  const requestKey = `deleteGroupBuyActivity:${activityId}:${stableStringify(input)}`;
  return dedupeRequest(requestKey, async () => {
    const response = await fetch(`${backendBaseUrl}/api/admin/group-buy-activities/${activityId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Delete group-buy activity failed");
    }

    return payload.activity;
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

export function getBackendBaseUrl() {
  return backendBaseUrl;
}
