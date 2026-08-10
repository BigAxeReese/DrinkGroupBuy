import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import {
  approveAdminRefundRequest,
  listAdminRefundRequests,
  rejectAdminRefundRequest
} from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";

export function AdminRefundRequestsScreen({ navigation, memberAction }) {
  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notice, setNotice] = useState(null);

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      setRefundRequests(await listAdminRefundRequests());
    } catch (error) {
      setLoadError(error.message || "退款申請載入失敗。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const pendingRequests = refundRequests.filter((request) => request.status === "pending");
  const reviewedRequests = refundRequests.filter((request) => request.status !== "pending");

  async function handleApprove(requestId) {
    setBusyRequestId(requestId);
    setNotice(null);
    try {
      await approveAdminRefundRequest(requestId);
      setNotice({ type: "success", text: "已核准並執行退款。" });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: getRefundReviewErrorMessage(error) });
    } finally {
      setBusyRequestId(null);
    }
  }

  function beginReject(requestId) {
    setRejectingRequestId(requestId);
    setRejectionReason("");
    setNotice(null);
  }

  function cancelReject() {
    setRejectingRequestId(null);
    setRejectionReason("");
  }

  async function handleReject(requestId) {
    if (!rejectionReason.trim()) {
      setNotice({ type: "error", text: "請填寫駁回原因。" });
      return;
    }

    setBusyRequestId(requestId);
    setNotice(null);
    try {
      await rejectAdminRefundRequest(requestId, { reason: rejectionReason.trim() });
      setNotice({ type: "success", text: "已駁回這筆退款申請。" });
      cancelReject();
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: getRefundReviewErrorMessage(error) });
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <MobileScreen
      title="退款審核"
      subtitle="審核商家提出的退款申請，核准後會直接執行退款。"
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
        <Section title={`待審核（${pendingRequests.length} 筆）`}>
          {pendingRequests.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有待審核的退款申請。</Text>
          ) : null}
          {pendingRequests.map((request) => {
            const isBusy = busyRequestId === request.id;
            const isRejecting = rejectingRequestId === request.id;

            return (
              <View key={request.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.storeId}>店家：{request.storeId}</Text>
                    <Text style={styles.meta}>訂單編號：{request.orderId}</Text>
                  </View>
                  <Text style={styles.amount}>{formatCurrency(request.requestedAmount)}</Text>
                </View>
                <Text style={styles.reasonText}>申請原因：{request.reason}</Text>

                {isRejecting ? (
                  <View style={styles.form}>
                    <TextInput
                      accessibilityLabel="駁回原因"
                      multiline
                      onChangeText={setRejectionReason}
                      placeholder="請填寫駁回原因"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      value={rejectionReason}
                    />
                    <View style={styles.actionsRow}>
                      <PrimaryButton
                        disabled={isBusy}
                        label="取消"
                        onPress={cancelReject}
                        style={styles.actionButton}
                        variant="secondary"
                      />
                      <PrimaryButton
                        disabled={isBusy}
                        label={isBusy ? "處理中…" : "確認駁回"}
                        onPress={() => handleReject(request.id)}
                        style={styles.actionButton}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionsRow}>
                    <PrimaryButton
                      disabled={isBusy}
                      label="駁回"
                      onPress={() => beginReject(request.id)}
                      style={styles.actionButton}
                      variant="secondary"
                    />
                    <PrimaryButton
                      disabled={isBusy}
                      label={isBusy ? "處理中…" : "核准並退款"}
                      onPress={() => handleApprove(request.id)}
                      style={styles.actionButton}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </Section>
      ) : null}

      {!loading && !loadError ? (
        <Section title={`審核紀錄（${reviewedRequests.length} 筆）`}>
          {reviewedRequests.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有已審核的退款申請。</Text>
          ) : null}
          {reviewedRequests.map((request) => (
            <View key={request.id} style={styles.historyCard}>
              <View style={styles.cardHeader}>
                <View style={styles.flex}>
                  <Text style={styles.storeId}>店家：{request.storeId}</Text>
                  <Text style={styles.meta}>訂單編號：{request.orderId}</Text>
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

function getRefundReviewErrorMessage(error) {
  const errorCode = error?.payload?.error ?? error?.payload?.status;
  if (typeof errorCode === "string" && errorCode.startsWith("Refund request is already")) {
    return "這筆申請已經被其他人審核過了，請重新整理。";
  }
  return error?.message || "審核操作失敗，請稍後再試。";
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
  card: {
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12
  },
  historyCard: {
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 12
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  flex: {
    flex: 1
  },
  storeId: {
    color: "#0f172a",
    fontSize: 13,
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
  reasonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700"
  },
  form: {
    gap: 8
  },
  input: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlignVertical: "top"
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8
  },
  actionButton: {
    flex: 1
  }
});
