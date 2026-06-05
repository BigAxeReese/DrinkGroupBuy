import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency } from "../utils/calculations";

export function PaymentReportScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const allowedOrderIds = new Set(appState.orders.filter((order) => order.customerId === selectedCustomerId).map((order) => order.id));
  const payment = appState.paymentReports.find((item) => item.orderId === route.params?.orderId && allowedOrderIds.has(item.orderId))
    ?? appState.paymentReports.find((item) => allowedOrderIds.has(item.orderId));
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
  const canCapture = payment.discountStatus === "qualified";

  return (
    <MobileScreen
      title="付款預授權"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="預授權狀態">
        <StatusBadge owner="payment" value={payment.status} />
        <Text style={styles.amount}>{formatCurrency(payment.originalAmount)}</Text>
        <Text style={styles.meta}>目前僅預授權，尚未正式扣款。</Text>
        <Text style={styles.meta}>達標後將依優惠價請款。</Text>
      </Section>

      <Section title="授權金額">
        <View style={styles.providerCard}>
          <Text style={styles.providerName}>LINE Pay</Text>
          <Text style={styles.providerMeta}>付款對象：{payment.recipientName}</Text>
        </View>
        <View style={styles.amountRows}>
          <AmountRow label="原價 originalAmount" value={payment.originalAmount} />
          <AmountRow label="預授權 authorizedAmount" value={payment.authorizedAmount} />
          <Text style={styles.meta}>authorizationStatus：{payment.authorizationStatus}</Text>
        </View>
        <PlaceholderBox title="Line Pay authorization" />
      </Section>

      {isCaptured ? (
        <Section title="請款結果">
          <AmountRow label="優惠價 finalAmount" value={payment.finalAmount} />
          <AmountRow label="實際請款 captureAmount" value={payment.captureAmount} />
          <AmountRow label="釋放差額 releasedAmount" value={payment.releasedAmount} />
        </Section>
      ) : null}

      {!isAuthorized && !isCaptured ? (
        <PrimaryButton label="模擬預授權成功" onPress={() => actions.authorizeLinePayPayment(payment.orderId)} />
      ) : (
        <PrimaryButton
          label={isCaptured ? "已完成優惠價請款" : canCapture ? "模擬達標後部分請款" : "等待達標後請款"}
          onPress={() => !isCaptured && canCapture && actions.captureQualifiedPayment(payment.orderId, payment.finalAmount ?? Math.round(payment.originalAmount * 0.83))}
        />
      )}
      <PrimaryButton label="前往取貨資訊" variant="secondary" onPress={() => navigation.go("pickupInfo", { orderId: payment.orderId })} />
    </MobileScreen>
  );
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
