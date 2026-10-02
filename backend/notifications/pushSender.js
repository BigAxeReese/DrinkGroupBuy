"use strict";

// Sends customer-facing push notifications (group-buy succeeded, drink ready for pickup) via the
// Expo push service (a plain HTTPS POST -- no SDK/credentials setup needed), using the mobile
// app's existing EAS projectId.
//
// Same shape as ../payments/alertNotifier.js on purpose: a broken or slow push call must never
// take down the settlement/pickup flow that triggered it, so failures are swallowed here and
// reported back as {sent, reason} instead of thrown.

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_TIMEOUT_MS = 5_000;

async function sendPushNotification({ expoPushTokens, title, body, data }, { logger = console } = {}) {
  const tokens = Array.isArray(expoPushTokens) ? expoPushTokens.filter(Boolean) : [];
  if (tokens.length === 0) return { sent: false, reason: "no_recipients" };

  const messages = tokens.map((to) => ({ to, title, body, data }));

  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error?.("[push-notification] Expo push API responded with an error status", {
        status: response.status,
      });
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true, recipientCount: tokens.length };
  } catch (error) {
    logger.error?.("[push-notification] Expo push API call failed", { message: error.message });
    return { sent: false, reason: "request_failed" };
  }
}

// High-level entry point the settlement/pickup services call: look up every device on file for
// these users and push to all of them. Users with no registered device are silently skipped --
// that's the expected common case (app not yet reinstalled with push support), not an error.
// The repository lookup is wrapped the same way sendPushNotification wraps its own fetch call --
// this function must never throw, so callers can fire it without their own try/catch.
async function notifyUsers({ userIds, title, body, data }, { pushTokenRepository, logger = console } = {}) {
  if (!pushTokenRepository) return { sent: false, reason: "not_configured" };

  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueUserIds.length === 0) return { sent: false, reason: "no_recipients" };

  let expoPushTokens;
  try {
    expoPushTokens = await pushTokenRepository.getPushTokensForUsers(uniqueUserIds);
  } catch (error) {
    logger.error?.("[push-notification] push token lookup failed", { message: error.message });
    return { sent: false, reason: "lookup_failed" };
  }
  return sendPushNotification({ expoPushTokens, title, body, data }, { logger });
}

module.exports = { sendPushNotification, notifyUsers };
