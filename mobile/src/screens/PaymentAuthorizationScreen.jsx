import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency } from "../utils/calculations";
import { getManualRepaymentStateInfo } from "../utils/manualRepayment";
import { requestEcpayAuthorization, requestLinePayAuthorization, requestLinePayRepayment } from "../utils/apiClient";

const LINE_PAY_SYNC_POLL_INTERVAL_MS = 3000;
const LINE_PAY_SYNC_POLL_TIMEOUT_MS = 90000;
// ECPay implementation remains available; keep its customer-facing entry hidden for now.
const SHOW_ECPAY_PAYMENT_OPTION = false;
const PAYMENT_SYNC_FINISHED_STATUSES = new Set([
  "authorized",
  "captured",
  "authorization_voided",
  "failed",
  "refunded"
]);

export function PaymentAuthorizationScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const [linePayStatus, setLinePayStatus] = useState("idle");
  const [linePayMessage, setLinePayMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("line_pay");
  const pollIntervalRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const pollInFlightRef = useRef(false);
  const allowedOrderIds = new Set(appState.orders.filter((order) => order.customerId === selectedCustomerId).map((order) => order.id));
  const payment = appState.paymentAuthorizations.find((item) => item.orderId === route.params?.orderId && allowedOrderIds.has(item.orderId))
    ?? appState.paymentAuthorizations.find((item) => allowedOrderIds.has(item.orderId));
  const order = payment ? appState.orders.find((item) => item.id === payment.orderId) : null;

  useEffect(() => () => {
    stopLinePaySyncPolling({ pollIntervalRef, pollTimeoutRef });
  }, []);

  useEffect(() => {
    if (!payment?.orderId) return undefined;

    const syncWhenActive = () => {
      syncBackendOrder({
        orderId: payment.orderId,
        actions,
        setSyncStatus,
        setSyncMessage,
        silentPending: true,
        silentError: true
      }).catch(() => {
        // Keep foreground refresh non-intrusive; manual refresh still reports the error.
      });
    };

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncWhenActive();
      }
    });

    let removeWindowFocusListener = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", syncWhenActive);
      removeWindowFocusListener = () => window.removeEventListener("focus", syncWhenActive);
    }

    return () => {
      appStateSubscription?.remove?.();
      removeWindowFocusListener?.();
    };
  }, [actions, payment?.orderId]);

  if (!payment) {
    return (
      <MobileScreen
        title="付款預授權"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有付款資料">
          <Text style={styles.meta}>訂單已清空，送出購物車後才會建立 LINE Pay 預授權 mock。</Text>
        </Section>
      </MobileScreen>
    );
  }

  const isAuthorized = payment.paymentStatus === "authorized" || payment.status === "authorized";
  const isCaptured = payment.paymentStatus === "captured" || payment.status === "captured";
  const isManualRepayment = route.params?.mode === "manualRepayment"
    || payment.paymentStatus === "failed"
    || order?.paymentStatus === "failed";
  const manualRepayment = order?.manualRepayment ?? null;
  const repaymentState = isManualRepayment ? getManualRepaymentStateInfo(manualRepayment) : null;
  const canCapture = payment.discountStatus === "qualified";
  const deepLinkResultMessage = getDeepLinkResultMessage(route.params);

  return (
    <MobileScreen
      title={isManualRepayment ? "重新付款" : "付款預授權"}
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title={isManualRepayment ? "付款狀態" : "預授權狀態"}>
        <StatusBadge owner="payment" value={payment.status} />
        <Text style={styles.amount}>{formatCurrency(isManualRepayment ? (manualRepayment?.finalAmount ?? payment.finalAmount ?? payment.originalAmount) : payment.originalAmount)}</Text>
        {isManualRepayment ? (
          <>
            <Text style={styles.meta}>{repaymentState.statusText}</Text>
            {manualRepayment?.reason !== "manual_repayment_expired" ? (
              <Text style={styles.meta}>可付款至 {formatRepaymentCutoff(manualRepayment?.cutoffAt)}。</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.meta}>目前僅預授權，尚未正式扣款。</Text>
            <Text style={styles.meta}>達標後將依優惠價請款。</Text>
          </>
        )}
      </Section>

      <Section title="授權金額">
        <View style={styles.providerCard}>
          <Text style={styles.providerName}>
            {getProviderDisplayName(isAuthorized || isCaptured ? payment.provider : selectedProvider)}
          </Text>
          <Text style={styles.providerMeta}>付款對象：{payment.recipientName}</Text>
        </View>
        <View style={styles.amountRows}>
          <AmountRow label="原價 originalAmount" value={payment.originalAmount} />
          <AmountRow label="預授權 authorizedAmount" value={payment.authorizedAmount} />
          <Text style={styles.meta}>authorizationStatus：{payment.authorizationStatus}</Text>
        </View>
        <PlaceholderBox title="Line Pay authorization" />
      </Section>

      {!isManualRepayment && !isAuthorized && !isCaptured ? (
        <Section title="付款方式">
          <View style={styles.providerToggleRow}>
            <PrimaryButton
              label="LINE Pay"
              variant={selectedProvider === "line_pay" ? "primary" : "secondary"}
              onPress={() => setSelectedProvider("line_pay")}
            />
            {SHOW_ECPAY_PAYMENT_OPTION ? (
              <PrimaryButton
                label="信用卡"
                variant={selectedProvider === "ecpay" ? "primary" : "secondary"}
                onPress={() => setSelectedProvider("ecpay")}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section title={selectedProvider === "ecpay" ? "信用卡（ECPay）Stage 測試" : "LINE Pay sandbox"}>
        <Text style={styles.meta}>
          {isManualRepayment
            ? "此按鈕會開啟 LINE Pay，並以結算後金額直接付款。"
            : `此按鈕會向 backend 建立${selectedProvider === "ecpay" ? "信用卡（ECPay）" : "LINE Pay"}預授權請求，並開啟付款頁。`}
        </Text>
        <Text style={styles.meta}>
          {isManualRepayment
            ? "付款成功後會自動更新訂單並加入店家製作清單。"
            : "完成授權後會自動刷新 backend 訂單狀態；目前只做授權 confirm，不會正式請款。"}
        </Text>
        {linePayMessage ? (
          <Text style={linePayStatus === "error" ? styles.errorText : styles.successText}>{linePayMessage}</Text>
        ) : null}
        {deepLinkResultMessage ? (
          <Text style={deepLinkResultMessage.type === "error" ? styles.errorText : styles.successText}>
            {deepLinkResultMessage.message}
          </Text>
        ) : null}
        <PrimaryButton
          label={repaymentState?.disabled
            ? repaymentState.disabledLabel
            : linePayStatus === "loading"
              ? "正在建立付款請求..."
              : isManualRepayment
                ? "前往 LINE Pay 重新付款"
                : selectedProvider === "ecpay"
                  ? "前往信用卡預授權"
                  : "前往 LINE Pay 預授權"}
          disabled={Boolean(repaymentState?.disabled)}
          onPress={() => {
            if (linePayStatus === "loading" || repaymentState?.disabled) return;
            const startPayment = isManualRepayment ? startLinePayRepayment : startPaymentAuthorization;
            startPayment({
              payment,
              order,
              provider: selectedProvider,
              routeRevision: {
                id: route.params?.orderRevisionId,
                amount: route.params?.revisionAmount,
                items: route.params?.revisionItems
              },
              actions,
              pollIntervalRef,
              pollTimeoutRef,
              pollInFlightRef,
              setLinePayStatus,
              setLinePayMessage,
              setSyncStatus,
              setSyncMessage
            });
          }}
        />
        <PrimaryButton
          label={syncStatus === "loading" ? "正在刷新付款狀態..." : "刷新付款狀態"}
          variant="secondary"
          onPress={() => {
            if (syncStatus === "loading") return;
            syncBackendOrder({ orderId: payment.orderId, actions, setSyncStatus, setSyncMessage });
          }}
        />
        {syncMessage ? (
          <Text style={syncStatus === "error" ? styles.errorText : styles.successText}>{syncMessage}</Text>
        ) : null}
      </Section>

      {isCaptured ? (
        <Section title="請款結果">
          <AmountRow label="優惠價 finalAmount" value={payment.finalAmount} />
          <AmountRow label="實際請款 captureAmount" value={payment.captureAmount} />
          <AmountRow label="釋放差額 releasedAmount" value={payment.releasedAmount} />
        </Section>
      ) : null}

      {!isManualRepayment && !isAuthorized && !isCaptured ? (
        <PrimaryButton label="模擬預授權成功" onPress={() => actions.authorizeLinePayPayment(payment.orderId)} />
      ) : !isManualRepayment ? (
        <PrimaryButton
          label={isCaptured ? "已完成優惠價請款" : canCapture ? "模擬達標後部分請款" : "等待達標後請款"}
          onPress={() => !isCaptured && canCapture && actions.captureQualifiedPayment(payment.orderId, payment.finalAmount ?? Math.round(payment.originalAmount * 0.83))}
        />
      ) : null}
      <PrimaryButton label="前往取貨資訊" variant="secondary" onPress={() => navigation.go("pickupInfo", { orderId: payment.orderId })} />
    </MobileScreen>
  );
}

async function syncBackendOrder({
  orderId,
  actions,
  setSyncStatus,
  setSyncMessage,
  silentPending = false,
  silentError = false
}) {
  try {
    if (!silentPending) {
      setSyncStatus("loading");
      setSyncMessage("");
    }
    const result = await actions.syncOrderFromBackend(orderId);
    if (silentPending && !PAYMENT_SYNC_FINISHED_STATUSES.has(result.order.paymentStatus)) {
      return result;
    }
    setSyncStatus("ready");
    setSyncMessage(`已同步後端狀態：${result.order.paymentStatus}`);
    return result;
  } catch (error) {
    if (!silentError) {
      setSyncStatus("error");
      setSyncMessage(error.message);
    }
    throw error;
  }
}

async function startLinePayRepayment({
  payment,
  order,
  actions,
  pollIntervalRef,
  pollTimeoutRef,
  pollInFlightRef,
  setLinePayStatus,
  setLinePayMessage,
  setSyncStatus,
  setSyncMessage
}) {
  try {
    if (!payment || !order) {
      throw new Error("找不到可重新付款的訂單資料");
    }

    setLinePayStatus("loading");
    setLinePayMessage("");
    const payload = await requestLinePayRepayment({
      orderId: order.id,
      productName: order.itemName || "DrinkGroupBuy 飲料訂單",
      packageName: payment.recipientName || "DrinkGroupBuy"
    });
    const paymentUrl = payload.paymentUrl?.web || payload.paymentUrl?.app;
    if (!paymentUrl) throw new Error("LINE Pay 沒有回傳付款網址");

    await Linking.openURL(paymentUrl);
    setLinePayStatus("ready");
    setLinePayMessage("已開啟 LINE Pay。付款完成後回到 App，訂單狀態會自動刷新。");
    startLinePaySyncPolling({
      orderId: payment.orderId,
      actions,
      pollIntervalRef,
      pollTimeoutRef,
      pollInFlightRef,
      setSyncStatus,
      setSyncMessage,
      finishedStatuses: new Set(["captured"]),
      waitingMessage: "等待 LINE Pay 重新付款結果。"
    });
  } catch (error) {
    setLinePayStatus("error");
    setLinePayMessage(getManualRepaymentErrorMessage(error));
    if (error.payload?.status === "already_paid") {
      syncBackendOrder({
        orderId: payment.orderId,
        actions,
        setSyncStatus,
        setSyncMessage
      }).catch(() => {});
    }
  }
}

async function startPaymentAuthorization({
  payment,
  order,
  provider = "line_pay",
  routeRevision = null,
  actions,
  pollIntervalRef,
  pollTimeoutRef,
  pollInFlightRef,
  setLinePayStatus,
  setLinePayMessage,
  setSyncStatus,
  setSyncMessage
}) {
  const providerLabel = provider === "ecpay" ? "信用卡" : "LINE Pay";
  let revisionPayment = null;
  try {
    if (!payment || !order) {
      throw new Error("找不到可預授權的訂單資料");
    }

    setLinePayStatus("loading");
    setLinePayMessage("");

    revisionPayment = getRevisionPaymentContext(order, payment, routeRevision);
    const paymentAmount = revisionPayment?.amount ?? payment.originalAmount;

    const payload = provider === "ecpay"
      ? await requestEcpayAuthorization({
          orderId: order.id,
          amount: paymentAmount
        })
      : await requestLinePayAuthorization({
          orderId: order.id,
          orderRevisionId: revisionPayment?.id,
          amount: paymentAmount,
          productName: order.itemName || "DrinkGroupBuy 飲料訂單",
          packageName: payment.recipientName || "DrinkGroupBuy",
          products: buildLinePayProducts(order, payment, revisionPayment)
        });
    const paymentUrl = payload.paymentUrl?.web || payload.paymentUrl?.app;
    if (!paymentUrl) {
      throw new Error(`${providerLabel} 沒有回傳付款網址`);
    }

    await Linking.openURL(paymentUrl);
    setLinePayStatus("ready");
    setLinePayMessage(`已開啟${providerLabel}。完成授權後回到 App，付款狀態會自動刷新。`);
    startLinePaySyncPolling({
      orderId: payment.orderId,
      orderRevisionId: revisionPayment?.id,
      actions,
      pollIntervalRef,
      pollTimeoutRef,
      pollInFlightRef,
      setSyncStatus,
      setSyncMessage
    });
  } catch (error) {
    if (error.payload?.status === "already_authorized") {
      setLinePayStatus("ready");
      setLinePayMessage(`此訂單已完成${providerLabel}授權，正在同步 backend 狀態。`);
      syncBackendOrder({
        orderId: payment.orderId,
        actions,
        setSyncStatus,
        setSyncMessage
      }).catch(() => {});
      return;
    }

    if (error.payload?.status === "authorization_already_pending") {
      setLinePayStatus("ready");
      setLinePayMessage(`此訂單已有一筆${providerLabel}授權流程進行中，會自動等待 backend 結果。`);
      startLinePaySyncPolling({
        orderId: payment.orderId,
        orderRevisionId: revisionPayment?.id,
        actions,
        pollIntervalRef,
        pollTimeoutRef,
        pollInFlightRef,
        setSyncStatus,
        setSyncMessage
      });
      return;
    }

    setLinePayStatus("error");
    setLinePayMessage(getLinePayErrorMessage(error));
  }
}

function startLinePaySyncPolling({
  orderId,
  orderRevisionId,
  actions,
  pollIntervalRef,
  pollTimeoutRef,
  pollInFlightRef,
  setSyncStatus,
  setSyncMessage,
  finishedStatuses = PAYMENT_SYNC_FINISHED_STATUSES,
  waitingMessage = "等待 LINE Pay 授權結果，完成後會自動更新訂單狀態。"
}) {
  stopLinePaySyncPolling({ pollIntervalRef, pollTimeoutRef });
  const deadline = Date.now() + LINE_PAY_SYNC_POLL_TIMEOUT_MS;

  setSyncStatus("loading");
  setSyncMessage(waitingMessage);

  const poll = async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;

    try {
      const result = await actions.syncOrderFromBackend(orderId);
      const paymentStatus = result.order.paymentStatus;
      const revisionStillPending = orderRevisionId && result.order.pendingRevision?.id === orderRevisionId;

      if (finishedStatuses.has(paymentStatus) && !revisionStillPending) {
        stopLinePaySyncPolling({ pollIntervalRef, pollTimeoutRef });
        setSyncStatus("ready");
        setSyncMessage(`已同步後端狀態：${paymentStatus}`);
        return;
      }

      if (Date.now() >= deadline) {
        stopLinePaySyncPolling({ pollIntervalRef, pollTimeoutRef });
        setSyncStatus("idle");
        setSyncMessage("尚未收到 LINE Pay 授權結果，可稍後按「刷新付款狀態」。");
      }
    } catch (error) {
      stopLinePaySyncPolling({ pollIntervalRef, pollTimeoutRef });
      setSyncStatus("error");
      setSyncMessage(error.message);
    } finally {
      pollInFlightRef.current = false;
    }
  };

  pollTimeoutRef.current = setTimeout(poll, 1500);
  pollIntervalRef.current = setInterval(poll, LINE_PAY_SYNC_POLL_INTERVAL_MS);
}

function stopLinePaySyncPolling({ pollIntervalRef, pollTimeoutRef }) {
  if (pollIntervalRef.current) {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
  }
  if (pollTimeoutRef.current) {
    clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = null;
  }
}

function getLinePayErrorMessage(error) {
  if (error.payload?.status === "already_authorized") {
    return "此訂單已完成 LINE Pay 授權，不需要重複付款。";
  }
  if (error.payload?.status === "authorization_already_pending") {
    return "此訂單已有一筆進行中的 LINE Pay 授權，請先完成該付款流程或稍後再試。";
  }
  return error.message;
}

function getManualRepaymentErrorMessage(error) {
  const messages = {
    already_paid: "這筆訂單已完成付款，正在更新訂單狀態。",
    repayment_already_pending: "已有一筆重新付款流程進行中，請完成該流程或稍後再試。",
    repayment_request_in_progress: "正在建立重新付款，請勿重複操作。",
    automatic_capture_not_finished: "系統仍在自動請款，暫時不能手動重新付款。",
    manual_repayment_expired: "已超過取餐前 15 分鐘，不能再重新付款。",
    original_payment_state_unknown: "暫時無法確認原付款狀態，請稍後再試。",
    original_authorization_void_failed: "原付款授權尚未解除，請稍後再試。"
  };
  return messages[error.payload?.status] || error.message;
}

function formatRepaymentCutoff(value) {
  if (!value) return "取餐開始前 15 分鐘";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "取餐開始前 15 分鐘";
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function getProviderDisplayName(provider) {
  if (provider === "ecpay" || provider === "mock_ecpay") return "信用卡（ECPay）";
  return "LINE Pay";
}

function getDeepLinkResultMessage(params = {}) {
  if (!params.linePayResultStatus) return null;
  const providerLabel = params.paymentResultSource === "ecpay" ? "信用卡" : "LINE Pay";
  if (params.linePayResultStatus === "authorized") {
    return { type: "success", message: `已從${providerLabel}返回 App，正在同步預授權結果。` };
  }
  if (params.linePayResultStatus === "captured") {
    return { type: "success", message: `已從${providerLabel}返回 App，正在同步付款結果。` };
  }
  if (params.linePayResultStatus === "cancelled") {
    return { type: "error", message: `${providerLabel}付款已取消，可重新發起付款。` };
  }
  if (params.linePayResultStatus === "pending") {
    return { type: "success", message: `已從${providerLabel}返回 App，付款結果確認中，請稍候。` };
  }
  return { type: "error", message: `${providerLabel}流程未完成，請查看付款狀態或重新付款。` };
}

function getRevisionPaymentContext(order, payment, routeRevision = null) {
  const id = routeRevision?.id
    ?? payment.pendingRevisionId
    ?? order.pendingRevisionId
    ?? order.pendingRevision?.id
    ?? null;
  if (!id) return null;

  return {
    id,
    amount: routeRevision?.amount
      ?? payment.revisionAmount
      ?? order.pendingRevisionAmount
      ?? order.pendingRevision?.originalAmount
      ?? payment.originalAmount,
    items: routeRevision?.items
      ?? payment.revisionItems
      ?? order.pendingRevisionItems
      ?? order.pendingRevision?.items
      ?? order.items
      ?? []
  };
}

function buildLinePayProducts(order, payment, revisionPayment = null) {
  const paymentAmount = revisionPayment?.amount ?? payment.originalAmount;
  const items = revisionPayment?.items || order.items || [];
  const products = items
    .map((item) => {
      const quantity = item.quantity || 1;
      const subtotal = Number(item.subtotal);
      if (!Number.isInteger(subtotal) || subtotal <= 0 || subtotal % quantity !== 0) {
        return null;
      }
      return {
        name: item.itemName || order.itemName || "飲料",
        quantity,
        price: subtotal / quantity
      };
    })
    .filter(Boolean);
  const productTotal = products.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (products.length > 0 && productTotal === paymentAmount) {
    return products;
  }

  return [
    {
      name: order.itemName || "DrinkGroupBuy 飲料訂單",
      quantity: 1,
      price: paymentAmount
    }
  ];
}

function AmountRow({ label, value }) {
  return (
    <View style={styles.amountRow}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={styles.amountValue}>{value == null ? "待計算" : formatCurrency(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    color: "#0f172a",
    fontSize: 34,
    fontWeight: "900"
  },
  meta: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  providerCard: {
    gap: 6,
    borderRadius: 16,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    padding: 14
  },
  providerName: {
    color: "#06c755",
    fontSize: 20,
    fontWeight: "900"
  },
  providerMeta: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "800"
  },
  providerToggleRow: {
    flexDirection: "row",
    gap: 10
  },
  successText: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20
  },
  errorText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20
  },
  amountRows: {
    gap: 8
  },
  amountRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12
  },
  amountLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800"
  },
  amountValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  }
});
