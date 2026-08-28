import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  DEFAULT_MAP_FILTERS,
  MIN_CUPS_OPTIONS,
  PICKUP_WITHIN_MINUTES_OPTIONS,
  RADIUS_OPTIONS
} from "../utils/groupBuyActivityMapFilters";

export function ActivityFilterPanel({ visible, filters, onApply, onClose }) {
  const [draft, setDraft] = useState({ ...DEFAULT_MAP_FILTERS, ...filters });

  useEffect(() => {
    if (visible) setDraft({ ...DEFAULT_MAP_FILTERS, ...filters });
  }, [visible, filters]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="關閉篩選面板"
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>搜尋偏好</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="關閉" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.rowLabel}>只看招募中</Text>
            <Switch
              accessibilityLabel="只看招募中"
              value={draft.recruitingOnly}
              onValueChange={(next) => setDraft((current) => ({ ...current, recruitingOnly: next }))}
              trackColor={{ true: "#2563eb", false: "#cbd5e1" }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>搜尋半徑</Text>
            <View style={styles.optionRow}>
              {RADIUS_OPTIONS.map((option) => (
                <SegmentButton
                  key={option.label}
                  label={option.label}
                  active={draft.radiusKm === option.value}
                  onPress={() => setDraft((current) => ({ ...current, radiusKm: option.value }))}
                />
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>優惠門檻</Text>
            <View style={styles.optionRow}>
              {MIN_CUPS_OPTIONS.map((option) => (
                <SegmentButton
                  key={option.label}
                  label={option.label}
                  active={draft.minCups === option.value}
                  onPress={() => setDraft((current) => ({ ...current, minCups: option.value }))}
                />
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>取餐時間</Text>
            <View style={styles.optionRow}>
              {PICKUP_WITHIN_MINUTES_OPTIONS.map((option) => (
                <SegmentButton
                  key={option.label}
                  label={option.label}
                  active={draft.pickupWithinMinutes === option.value}
                  onPress={() => setDraft((current) => ({ ...current, pickupWithinMinutes: option.value }))}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => onApply(draft)}
            style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}
          >
            <Text style={styles.applyButtonText}>套用篩選條件</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SegmentButton({ label, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)"
  },
  sheet: {
    maxHeight: "88%",
    gap: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  closeIcon: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "900"
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7"
  },
  rowLabel: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800"
  },
  block: {
    gap: 10
  },
  blockLabel: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800"
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  segment: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#eef2f7"
  },
  segmentActive: {
    backgroundColor: "#111827"
  },
  segmentText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900"
  },
  segmentTextActive: {
    color: "#ffffff"
  },
  pressed: {
    opacity: 0.8
  },
  applyButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb"
  },
  applyButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  }
});
