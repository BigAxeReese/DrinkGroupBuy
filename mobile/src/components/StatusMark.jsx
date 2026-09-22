import { StyleSheet, View } from "react-native";
import { sizes } from "../theme/tokens";

// Small drawn glyph shown before a status label, so meaning never depends on colour alone.
// `mark` is one of the tone marks in theme/tokens.js: check, dots, bang, cross, dash.
export function StatusMark({ mark, color }) {
  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.box}>
      {renderMark(mark, color)}
    </View>
  );
}

function renderMark(mark, color) {
  if (mark === "check") return <View style={[styles.check, { borderColor: color }]} />;
  if (mark === "dash") return <View style={[styles.dash, { backgroundColor: color }]} />;
  if (mark === "bang") {
    return (
      <>
        <View style={[styles.bangBar, { backgroundColor: color }]} />
        <View style={[styles.bangDot, { backgroundColor: color }]} />
      </>
    );
  }
  if (mark === "cross") {
    return (
      <>
        <View style={[styles.crossBar, { backgroundColor: color, transform: [{ rotate: "45deg" }] }]} />
        <View style={[styles.crossBar, { backgroundColor: color, transform: [{ rotate: "-45deg" }] }]} />
      </>
    );
  }
  return (
    <View style={styles.dots}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 14,
    height: 14
  },
  dots: {
    width: 14,
    height: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2.5
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5
  },
  check: {
    position: "absolute",
    left: 4,
    top: 1,
    width: 5,
    height: 9,
    borderRightWidth: sizes.stroke,
    borderBottomWidth: sizes.stroke,
    transform: [{ rotate: "45deg" }]
  },
  bangBar: {
    position: "absolute",
    left: 6,
    top: 0,
    width: 2,
    height: 9,
    borderRadius: 1
  },
  bangDot: {
    position: "absolute",
    left: 5.5,
    top: 11,
    width: 3,
    height: 3,
    borderRadius: 1.5
  },
  crossBar: {
    position: "absolute",
    left: 6,
    top: 0,
    width: 2,
    height: 14,
    borderRadius: 1
  },
  dash: {
    position: "absolute",
    left: 2,
    top: 6,
    width: 10,
    height: 2,
    borderRadius: 1
  }
});
