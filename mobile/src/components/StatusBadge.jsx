import { StyleSheet, Text, View } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { getStatusTone } from "../theme/statusTones";
import {
  groupBuyActivityStatusLabels,
  merchantPaymentStatusLabels,
  paymentStatusLabels,
  pickupStatusLabels,
  refundRequestStatusLabels
} from "../types/prototypeTypes";
import { TonePill } from "./TonePill";

// Migrated routes get the new style (tone colours plus a drawn mark, see theme/statusTones.js and
// theme/MilkTeaContext.js); the old pastel pill below stays until the last screen has migrated.
export function StatusBadge({ owner = "groupBuyActivity", value }) {
  const milkTea = useMilkTea();
  const fallbackLabels = {
    ordering: "訂單製作中"
  };
  const labelMaps = {
    groupBuyActivity: groupBuyActivityStatusLabels,
    merchantPayment: merchantPaymentStatusLabels,
    payment: paymentStatusLabels,
    pickup: pickupStatusLabels,
    refundRequest: refundRequestStatusLabels
  };
  const label = labelMaps[owner]?.[value] ?? fallbackLabels[value] ?? value;
  if (milkTea) return <TonePill tone={getStatusTone(owner, value) ?? "neutral"} label={label} />;

  const styleKey = owner === "merchantPayment" && value === "failed"
    ? "merchantPaymentFailed"
    : value;

  return (
    <View style={[styles.badge, styles[styleKey] || styles.default]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  text: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800"
  },
  recruiting: { backgroundColor: "#dbeafe" },
  confirmed: { backgroundColor: "#dcfce7" },
  formed: { backgroundColor: "#dcfce7" },
  failed: { backgroundColor: "#fee2e2" },
  merchantPaymentFailed: { backgroundColor: "#f1f5f9" },
  cancelled: { backgroundColor: "#f1f5f9" },
  full: { backgroundColor: "#fef3c7" },
  pending: { backgroundColor: "#fef3c7" },
  submitted: { backgroundColor: "#dbeafe" },
  confirmed: { backgroundColor: "#dcfce7" },
  ordering: { backgroundColor: "#fef3c7" },
  ready_for_pickup: { backgroundColor: "#dcfce7" },
  completed: { backgroundColor: "#e2e8f0" },
  not_required: { backgroundColor: "#e2e8f0" },
  ready: { backgroundColor: "#dcfce7" },
  picked_up: { backgroundColor: "#e2e8f0" },
  approved: { backgroundColor: "#dcfce7" },
  rejected: { backgroundColor: "#fee2e2" },
  default: { backgroundColor: "#e2e8f0" }
});
