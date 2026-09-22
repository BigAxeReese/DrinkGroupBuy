import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";
import {
  DEFAULT_MAP_FILTERS,
  MIN_CUPS_OPTIONS,
  PICKUP_WITHIN_MINUTES_OPTIONS,
  RADIUS_OPTIONS
} from "../utils/groupBuyActivityMapFilters";
import { ChoiceChip } from "./ChoiceChip";
import { PrimaryButton } from "./PrimaryButton";

export function ActivityFilterPanel({
  visible,
  filters,
  onApply,
  onClose,
  hasLocation = true,
  onOpenLocationSettings = null
}) {
  const [draft, setDraft] = useState({ ...DEFAULT_MAP_FILTERS, ...filters });
  // RN's Modal portals to a native overlay outside App.jsx's root SafeAreaView, so its content
  // doesn't inherit that safe-area padding -- without this, the sheet's bottom (and the apply
  // button in it) renders flush against the screen edge, under Android's gesture bar/back button.
  const insets = useSafeAreaInsets();

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
          style={styles.backdrop}
          onPress={onClose}
        />
        <View style={[styles.sheet, { paddingBottom: spacing.s24 + insets.bottom }]}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>搜尋偏好</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="關閉"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <View style={styles.closeIcon}>
                <View style={[styles.closeBar, styles.closeBarDown]} />
                <View style={[styles.closeBar, styles.closeBarUp]} />
              </View>
            </Pressable>
          </View>

          {/* 44px chips make the options taller than the sheet on shorter phones or larger system
              fonts, so they scroll while the header and the apply button stay in view. */}
          <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
            <View style={styles.toggleRow}>
              <Text style={styles.rowLabel}>只看招募中</Text>
              <Switch
                accessibilityLabel="只看招募中"
                value={draft.recruitingOnly}
                onValueChange={(next) => setDraft((current) => ({ ...current, recruitingOnly: next }))}
                trackColor={{ true: colors.accent, false: colors.lineInput }}
                thumbColor={colors.page}
                activeThumbColor={colors.page}
              />
            </View>

            <View style={styles.block}>
              <Text style={styles.blockLabel}>搜尋半徑</Text>
              {!hasLocation ? (
                <View style={styles.locationHintRow}>
                  <Text style={styles.blockHint}>需要開啟定位權限才能依距離篩選。</Text>
                  {onOpenLocationSettings ? (
                    <PrimaryButton label="前往設定開啟" onPress={onOpenLocationSettings} variant="secondary" />
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
          </ScrollView>

          <PrimaryButton label="套用篩選條件" onPress={handleApply} />
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

// One option of a pick-one group; ChoiceChip draws the selected / unselected / disabled looks.
function SegmentButton({ label, active, onPress, disabled = false }) {
  return <ChoiceChip disabled={disabled} label={label} onPress={onPress} role="radio" selected={active} />;
}

const ICON_SIZE = spacing.s24;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  // The scrim is `text` at partial opacity. It sits on the backdrop button, not on the overlay, so
  // the sheet above it stays fully opaque.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.text,
    opacity: 0.45
  },
  sheet: {
    maxHeight: "88%",
    gap: spacing.s20,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.s20,
    paddingTop: spacing.s20,
    paddingBottom: spacing.s24
  },
  headerRow: {
    minHeight: sizes.tap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  // 44px hit area; the negative margin lines the drawn cross up with the sheet's right padding.
  closeButton: {
    minWidth: sizes.tap,
    minHeight: sizes.tap,
    marginRight: -spacing.s12,
    alignItems: "center",
    justifyContent: "center"
  },
  closeIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE
  },
  closeBar: {
    position: "absolute",
    top: (ICON_SIZE - sizes.stroke) / 2,
    left: 0,
    width: ICON_SIZE,
    height: sizes.stroke,
    borderRadius: sizes.stroke / 2,
    backgroundColor: colors.text
  },
  closeBarDown: {
    transform: [{ rotate: "45deg" }]
  },
  closeBarUp: {
    transform: [{ rotate: "-45deg" }]
  },
  pressed: {
    opacity: 0.8
  },
  options: {
    flexShrink: 1
  },
  optionsContent: {
    gap: spacing.s20
  },
  toggleRow: {
    minHeight: sizes.tap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.s12,
    borderBottomWidth: sizes.stroke,
    borderBottomColor: colors.lineDecor
  },
  rowLabel: {
    ...typeScale.body,
    fontWeight: typeScale.label.fontWeight,
    color: colors.text
  },
  block: {
    gap: spacing.s12
  },
  blockLabel: {
    ...typeScale.body,
    fontWeight: typeScale.label.fontWeight,
    color: colors.text
  },
  locationHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s8
  },
  blockHint: {
    flex: 1,
    ...typeScale.caption,
    color: colors.textSecondary
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s8
  }
});
