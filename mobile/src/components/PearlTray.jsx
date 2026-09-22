import { StyleSheet, Text, View } from "react-native";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";
import { getPearlTray } from "../utils/pearlProgress";

const MAX_PEARLS = 10;
const PEARLS_PER_ROW = 5;
const PEARL_SIZE = 28;

// The big pearl tray (docs/ui-style-guide.md): a solid pearl is a filled slot on the way to the next
// discount tier, a 2px ring is a slot still open. A goal of ten cups or less is one pearl per cup;
// a larger goal puts several cups in each pearl, and says so. The exact numbers are always text, so
// the pearls are only the picture and are hidden from screen readers.
export function PearlTray({ currentCups, targetCups, participantCount, remainingTimeText }) {
  const { count, cupsPerPearl, filled } = getPearlTray(currentCups, targetCups, MAX_PEARLS);
  const rows = getPearlRows(count);
  const hasParticipants = participantCount != null;
  const hasMeta = hasParticipants || Boolean(remainingTimeText);

  return (
    <View style={styles.tray}>
      <View accessible accessibilityLabel={`目前 ${currentCups} 杯，目標 ${targetCups} 杯`} style={styles.headline}>
        <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.number}>
          {currentCups} / {targetCups}
        </Text>
        <Text style={styles.unit}>杯</Text>
      </View>

      {rows.length > 0 ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pearls}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.pearlRow}>
              {row.map((index) => (
                <View key={index} style={[styles.pearl, index < filled && styles.filled]} />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {cupsPerPearl > 1 ? <Text style={styles.caption}>1 顆珍珠 = {cupsPerPearl} 杯</Text> : null}

      {hasMeta ? (
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{hasParticipants ? `${participantCount} 人參與` : ""}</Text>
          {remainingTimeText ? <Text style={styles.meta}>{remainingTimeText}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

// Splits `count` pearls into evenly filled rows of at most five (6 -> 3 + 3, 7 -> 4 + 3, 9 -> 5 + 4).
function getPearlRows(count) {
  if (count < 1) return [];
  const rowCount = Math.ceil(count / PEARLS_PER_ROW);
  const perRow = Math.ceil(count / rowCount);
  return Array.from({ length: rowCount }, (_, row) => {
    const start = row * perRow;
    return Array.from({ length: Math.min(perRow, count - start) }, (_, offset) => start + offset);
  });
}

const styles = StyleSheet.create({
  tray: {
    gap: spacing.s16,
    padding: spacing.s20,
    borderRadius: radii.lg,
    backgroundColor: colors.recess
  },
  headline: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.s8
  },
  number: {
    ...typeScale.pearlNumber,
    color: colors.text
  },
  unit: {
    ...typeScale.body,
    color: colors.textSecondary
  },
  pearls: {
    gap: spacing.s12
  },
  pearlRow: {
    flexDirection: "row",
    gap: spacing.s12
  },
  pearl: {
    width: PEARL_SIZE,
    height: PEARL_SIZE,
    borderRadius: PEARL_SIZE / 2,
    borderWidth: sizes.stroke,
    borderColor: colors.accent
  },
  filled: {
    backgroundColor: colors.text,
    borderColor: colors.text
  },
  caption: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.s12
  },
  meta: {
    ...typeScale.bodyDense,
    color: colors.textSecondary
  }
});
