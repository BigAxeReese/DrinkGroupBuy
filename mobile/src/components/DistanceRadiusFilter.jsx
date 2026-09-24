import { ScrollView, StyleSheet } from "react-native";
import { spacing } from "../theme/tokens";
import { RADIUS_OPTIONS } from "../utils/groupBuyActivityMapFilters";
import { ChoiceChip } from "./ChoiceChip";

// A single row of pick-one chips instead of a dropdown: the six distances are always visible, one
// tap changes the filter, and nothing expands and pushes the list below it out of view. The row scrolls
// sideways when the chips are wider than the screen. It bleeds to the screen edges (negative margin
// matching the screens' own s20 side padding) so chips slide out from under the edge rather than being
// cut off at the padding.
export function DistanceRadiusFilter({ value = null, onChange, options = RADIUS_OPTIONS }) {
  return (
    <ScrollView
      accessibilityLabel="距離篩選"
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
    >
      {options.map((option) => (
        <ChoiceChip
          key={option.label}
          label={option.label}
          onPress={() => onChange(option.value)}
          role="radio"
          selected={option.value === value}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: {
    marginHorizontal: -spacing.s20
  },
  row: {
    gap: spacing.s8,
    paddingHorizontal: spacing.s20
  }
});
