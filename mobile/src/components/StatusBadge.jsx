import { StyleSheet, Text, View } from "react-native";
import { dealStatusLabels, paymentStatusLabels, pickupStatusLabels } from "../types/prototypeTypes";

export function StatusBadge({ owner = "deal", value }) {
  const fallbackLabels = {
    ordering: "訂單製作中"
  };
  const labelMaps = {
    deal: dealStatusLabels,
    payment: paymentStatusLabels,
    pickup: pickupStatusLabels
  };
  const label = labelMaps[owner]?.[value] ?? fallbackLabels[value] ?? value;

  return (
    <View style={[styles.badge, styles[value] || styles.default]}>
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
  cancelled: { backgroundColor: "#f1f5f9" },
  full: { backgroundColor: "#fef3c7" },
  pending: { backgroundColor: "#fef3c7" },
  submitted: { backgroundColor: "#dbeafe" },
  confirmed: { backgroundColor: "#dcfce7" },
  ordering: { backgroundColor: "#fef3c7" },
  not_required: { backgroundColor: "#e2e8f0" },
  ready: { backgroundColor: "#dcfce7" },
  picked_up: { backgroundColor: "#e2e8f0" },
  default: { backgroundColor: "#e2e8f0" }
});
