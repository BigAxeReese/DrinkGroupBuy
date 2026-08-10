import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import {
  createMerchantRefundRequest,
  listMerchantRefundRequests,
  listMerchantStoreOrders
} from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";

export function MerchantRefundRequestsScreen({ navigation, memberAction, selectedMerchantStoreId }) {
  const [capturedOrders, setCapturedOrders] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [formOrderId, setFormOrderId] = useState(null);
  const [formAmount, setFormAmount] = useState("");
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const [activeOrders, historyOrders, requests] = await Promise.all([
        listMerchantStoreOrders(selectedMerchantStoreId, { scope: "active" }),
        listMerchantStoreOrders(selectedMerchantStoreId, { scope: "history" }),
        listMerchantRefundRequests(selectedMerchantStoreId)
      ]);
      const allOrders = [...(activeOrders.orders || []), ...(historyOrders.orders || [])];
      setCapturedOrders(allOrders.filter((order) => order.paymentStatus === "captured"));
      setRefundRequests(requests || []);
    } catch (error) {
      setLoadError(error.message || "退款資料載入失敗。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedMerchantStoreId]);

  function pendingRequestForOrder(orderId) {
    return refundRequests.find((request) => request.orderId === orderId && request.status === "pending");
  }

  function beginRequest(order) {
    setFormOrderId(order.id);
    setFormAmount(String(order.finalAmount ?? 0));
    setFormReason("");
    setNotice(null);
  }

  function cancelRequest() {
    setFormOrderId(null);
    setFormAmount("");
    setFormReason("");
  }

  async function submitRequest(orderId) {
    const requestedAmount = Number(formAmount);
    if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
      setNotice({ type: "error", text: "退款金額必須是大於 0 的整數。" });
      return;
    }
    if (!formReason.trim()) {
      setNotice({ type: "error", text: "請填寫退款原因。" });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      await createMerchantRefundRequest(orderId, {
        requestedAmount,
        reason: formReason.trim()
      });
      setNotice({ type: "success", text: "退款申請已送出，待營運審核。" });
      cancelRequest();
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: getRefundRequestErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MobileScreen
      title="退款申請"
      subtitle="對已請款的訂單提出退款申請，將由營運審核後執行。"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      {loading ? <Text style={styles.emptyText}>載入中…</Text> : null}
      {loadError ? (
        <View style={styles.syncError}>
          <Text style={styles.errorText}>{loadError}</Text>
          <PrimaryButton label="重新整理" variant="secondary" onPress={loadData} />
        </View>
      ) : null}
      {notice ? (
        <Text style={notice.type === "error" ? styles.errorText : styles.successText}>{notice.text}</Text>
      ) : null}

      {!loading && !loadError ? (
        <Section title={`已請款訂單（${capturedOrders.length} 筆）`}>
          {capturedOrders.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有已請款的訂單。</Text>
          ) : null}
          {capturedOrders.map((order) => {
            const existingPending = pendingRequestForOrder(order.id);
            const amount = order.finalAmount ?? 0;
            const isEditing = formOrderId === order.id;

            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.orderTitle}>{order.activity?.title ?? "團購訂單"}</Text>
                    <Text style={styles.meta}>訂單編號：{order.id}</Text>
                  </View>
                  <Text style={styles.amount}>{formatCurrency(amount)}</Text>
                </View>

                {existingPending ? (
                  <View style={styles.pendingRow}>
                    <StatusBadge owner="refundRequest" value="pending" />
                    <Text style={styles.meta}>已申請 {formatCurrency(existingPending.requestedAmount)}，等待審核中</Text>
                  </View>
                ) : isEditing ? (
                  <View style={styles.form}>
                    <Text style={styles.fieldLabel}>退款金額</Text>
                    <TextInput
                      accessibilityLabel="退款金額"
                      keyboardType="number-pad"
                      onChangeText={setFormAmount}
                      style={styles.input}
                      value={formAmount}
                    />
                    <Text style={styles.fieldLabel}>退款原因</Text>
                    <TextInput
                      accessibilityLabel="退款原因"
                      multiline
                      onChangeText={setFormReason}
                      placeholder="例如：飲品製作錯誤、顧客申訴"
                      placeholderTextColor="#94a3b8"
                      style={[styles.input, styles.reasonInput]}
                      value={formReason}
                    />
                    <View style={styles.formActions}>
                      <PrimaryButton
                        disabled={submitting}
                        label="取消"
                        onPress={cancelRequest}
                        style={styles.formActionButton}
                        variant="secondary"
                      />
                      <PrimaryButton
                        disabled={submitting}
                        label={submitting ? "送出中…" : "送出申請"}
                        onPress={() => submitRequest(order.id)}
                        style={styles.formActionButton}
                      />
                    </View>
                  </View>
                ) : (
                  <PrimaryButton label="申請退款" onPress={() => beginRequest(order)} variant="secondary" />
                )}
              </View>
            );
          })}
        </Section>
      ) : null}

      {!loading && !loadError ? (
        <Section title={`退款申請紀錄（${refundRequests.length} 筆）`}>
          {refundRequests.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有退款申請紀錄。</Text>
          ) : null}
          {refundRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.orderHeader}>
                <View style={styles.flex}>
                  <Text style={styles.meta}>訂單編號：{request.orderId}</Text>
                  <Text style={styles.reasonText}>{request.reason}</Text>
                </View>
                <StatusBadge owner="refundRequest" value={request.status} />
              </View>
              <Text style={styles.meta}>申請金額：{formatCurrency(request.requestedAmount)}</Text>
              {request.status === "rejected" && request.rejectionReason ? (
                <Text style={styles.errorText}>駁回原因：{request.rejectionReason}</Text>
              ) : null}
            </View>
          ))}
        </Section>
      ) : null}
    </MobileScreen>
  );
}

function getRefundRequestErrorMessage(error) {
  const errorCode = error?.payload?.error ?? error?.payload?.status;
  const messages = {
    captured_payment_not_found: "找不到這筆訂單的已請款交易。",
    order_store_mismatch: "這筆訂單不屬於這間店。",
    already_fully_refunded: "這筆交易已經全額退款，沒有可退款的餘額。",
    refund_request_already_pending: "這筆訂單已經有一筆待審核的退款申請。",
    invalid_refund_amount: "退款金額必須是大於 0 的整數。",
    refund_amount_exceeds_remaining_amount: "退款金額超過可退款餘額。",
    refund_reason_required: "請填寫退款原因。"
  };
  return messages[errorCode] || error?.message || "退款申請送出失敗，請稍後再試。";
}

const styles = StyleSheet.create({
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800"
  },
  successText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800"
  },
  syncError: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    padding: 12
  },
  orderCard: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12
  },
  requestCard: {
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 12
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  flex: {
    flex: 1
  },
  orderTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3
  },
  amount: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "900"
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  form: {
    gap: 8
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  reasonInput: {
    minHeight: 72,
    textAlignVertical: "top"
  },
  formActions: {
    flexDirection: "row",
    gap: 8
  },
  formActionButton: {
    flex: 1
  },
  reasonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  }
});
