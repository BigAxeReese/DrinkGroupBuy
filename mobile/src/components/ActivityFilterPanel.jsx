import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  DEFAULT_MAP_FILTERS,
  MIN_CUPS_OPTIONS,
  PICKUP_WITHIN_MINUTES_OPTIONS,
  RADIUS_OPTIONS
} from "../utils/groupBuyActivityMapFilters";

export function ActivityFilterPanel({
  visible,
  filters,
  onApply,
  onClose,
  hasLocation = true,
  onOpenLocationSettings = null
}) {
  const [draft, setDraft] = useState({ ...DEFAULT_MAP_FILTERS, ...filters });

  useEffect(() => {
    if (visible) setDraft({ ...DEFAULT_MAP_FILTERS, ...filters });
  }, [visible, filters]);

  if (!visible && Platform.OS === "web") return null;

  function handleApply() {
    // Without a real GPS fix, "radiusKm" would measure distance from the prototype's fixed
    // fallback coordinate (mapCenter), not the customer -- silently applying it would show
    // "500公尺內" results that have nothing to do with where the customer actually is.
    onApply(hasLocation ? draft : { ...draft, radiusKm: null });
  }

  const content = (
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
            {!hasLocation ? (
              <View style={styles.locationHintRow}>
                <Text style={styles.blockHint}>需要開啟定位權限才能依距離篩選。</Text>
                {onOpenLocationSettings ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onOpenLocationSettings}
                    style={({ pressed }) => [styles.locationSettingsButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.locationSettingsButtonText}>前往設定開啟</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View style={styles.optionRow}>
              {RADIUS_OPTIONS.map((option) => (
                <SegmentButton
                  key={option.label}
                  label={option.label}
                  active={hasLocation && draft.radiusKm === option.value}
                  disabled={!hasLocation}
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
            onPress={handleApply}
            style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}
          >
            <Text style={styles.applyButtonText}>套用篩選條件</Text>
          </Pressable>
        </View>
      </View>
  );

  // Modal's web implementation portals straight to document.body, escaping the phone-frame
  // mockup (App.jsx's phoneFrame View) entirely -- overflow:hidden on that frame can't clip a
  // node that isn't actually its DOM descendant, so the sheet used to render full-viewport-width
  // instead of staying inside the mocked phone screen. Native has no such frame (the whole
  // screen IS the app), so Modal is still correct there.
  if (Platform.OS === "web") {
    return <View style={StyleSheet.absoluteFillObject}>{content}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

function SegmentButton({ label, active, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        active && styles.segmentActive,
        disabled && styles.segmentDisabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive, disabled && styles.segmentTextDisabled]}>
        {label}
      </Text>
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
  locationHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  blockHint: {
    flex: 1,
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700"
  },
  locationSettingsButton: {
    minHeight: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#2563eb"
  },
  locationSettingsButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
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
  segmentDisabled: {
    opacity: 0.5
  },
  segmentTextDisabled: {
    color: "#94a3b8"
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
