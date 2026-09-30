"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { notifyUsers, sendPushNotification } = require("./pushSender");

test("sendPushNotification posts one message per token to the Expo push API", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });

  const result = await sendPushNotification({
    expoPushTokens: ["token-a", "token-b"],
    title: "團購成團囉！",
    body: "測試團購已達成團門檻",
    data: { type: "group_buy_qualified", activityId: "activity-1" },
  });

  assert.deepEqual(result, { sent: true, recipientCount: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://exp.host/--/api/v2/push/send");
  assert.equal(calls[0].options.method, "POST");
  const messages = JSON.parse(calls[0].options.body);
  assert.deepEqual(messages, [
    { to: "token-a", title: "團購成團囉！", body: "測試團購已達成團門檻", data: { type: "group_buy_qualified", activityId: "activity-1" } },
    { to: "token-b", title: "團購成團囉！", body: "測試團購已達成團門檻", data: { type: "group_buy_qualified", activityId: "activity-1" } },
  ]);
});

test("sendPushNotification is a no-op when there are no tokens", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  const result = await sendPushNotification({ expoPushTokens: [], title: "x", body: "y" });

  assert.deepEqual(result, { sent: false, reason: "no_recipients" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("sendPushNotification reports failure without throwing when the Expo API call fails", async (t) => {
  t.mock.method(global, "fetch", async () => {
    throw new Error("network down");
  });

  const result = await sendPushNotification({ expoPushTokens: ["token-a"], title: "x", body: "y" });

  assert.deepEqual(result, { sent: false, reason: "request_failed" });
});

test("sendPushNotification reports failure without throwing on a non-2xx response", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: false, status: 500 }));

  const result = await sendPushNotification({ expoPushTokens: ["token-a"], title: "x", body: "y" });

  assert.deepEqual(result, { sent: false, reason: "http_500" });
});

test("notifyUsers is a no-op when no pushTokenRepository is configured", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  const result = await notifyUsers({ userIds: ["user-1"], title: "x", body: "y" }, {});

  assert.deepEqual(result, { sent: false, reason: "not_configured" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("notifyUsers looks up tokens for the deduped user list and sends to all of them", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });
  const lookups = [];
  const pushTokenRepository = {
    getPushTokensForUsers: async (userIds) => {
      lookups.push(userIds);
      return ["token-a", "token-b"];
    },
  };

  const result = await notifyUsers(
    { userIds: ["user-1", "user-1", "user-2"], title: "可以領飲料了！", body: "你的訂單已經可以領取" },
    { pushTokenRepository }
  );

  assert.deepEqual(lookups, [["user-1", "user-2"]]);
  assert.deepEqual(result, { sent: true, recipientCount: 2 });
  assert.equal(calls.length, 1);
});

test("notifyUsers is a no-op when the user list is empty and never calls the repository", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });
  let lookupCalled = false;
  const pushTokenRepository = {
    getPushTokensForUsers: async () => {
      lookupCalled = true;
      return [];
    },
  };

  const result = await notifyUsers({ userIds: [], title: "x", body: "y" }, { pushTokenRepository });

  assert.deepEqual(result, { sent: false, reason: "no_recipients" });
  assert.equal(lookupCalled, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});
