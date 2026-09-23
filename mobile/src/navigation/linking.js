// Recognizes the LINE Pay return deep link: drinkgroupbuy://payment/result?orderId=... (accepted both
// as scheme://host/path and scheme:path, since providers aren't consistent about which shape they send).
// Requires orderId; any other URL (or a payment-result link missing it) returns null and is ignored.
// Extracted verbatim from the old AppNavigator.js -- only the caller (RootNavigator.jsx) changed, not
// this parsing.
export function parseLinePayResultDeepLink(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = parsedUrl.protocol.replace(":", "");
  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname.replace(/^\/+/, "");
  const isPaymentResult = scheme === "drinkgroupbuy"
    && (
      (host === "payment" && path === "result")
      || path === "payment/result"
    );
  if (!isPaymentResult) return null;

  const orderId = parsedUrl.searchParams.get("orderId");
  if (!orderId) return null;

  return {
    orderId,
    status: parsedUrl.searchParams.get("status"),
    paymentFlow: parsedUrl.searchParams.get("paymentFlow"),
    transactionId: parsedUrl.searchParams.get("transactionId"),
    error: parsedUrl.searchParams.get("error"),
    source: parsedUrl.searchParams.get("source")
  };
}
