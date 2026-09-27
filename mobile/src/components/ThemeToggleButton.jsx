import { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { sizes } from "../theme/tokens";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

// A round light/dark switch drawn with plain Views (no icon package): a sun while the app is light, a
// moon while it is dark. Tapping it turns the icon half a revolution while the whole screen fades to the
// other theme (see ThemeProvider.toggleMode).
export function ThemeToggleButton() {
  const styles = useThemedStyles(makeStyles);
  const { isDark, toggleMode } = useTheme();
  const reduceMotion = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;

  function handlePress() {
    // A tap while the previous toggle is still fading is ignored, and so is its spin.
    if (!toggleMode() || reduceMotion) return;
    spin.setValue(0);
    Animated.timing(spin, {
      toValue: 1,
      duration: 440,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Pressable
      accessibilityLabel={isDark ? "切換為淺色模式" : "切換為深色模式"}
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.icon, { transform: [{ rotate }] }]}>
        {isDark ? (
          <>
            <View style={styles.moonBody} />
            <View style={styles.moonCut} />
          </>
        ) : (
          <>
            <View style={styles.sunCore} />
            {RAY_ANGLES.map((angle) => (
              <View key={angle} style={[styles.rayHolder, { transform: [{ rotate: `${angle}deg` }] }]}>
                <View style={styles.ray} />
              </View>
            ))}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const ICON_SIZE = 24;

const makeStyles = (colors) => StyleSheet.create({
  button: {
    width: sizes.tap,
    height: sizes.tap,
    borderRadius: sizes.tap / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.recess
  },
  pressed: {
    opacity: 0.75
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE
  },
  sunCore: {
    position: "absolute",
    top: 7,
    left: 7,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentInk
  },
  rayHolder: {
    position: "absolute",
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center"
  },
  ray: {
    width: 2,
    height: 4,
    borderRadius: 1,
    backgroundColor: colors.accentInk
  },
  moonBody: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accentInk
  },
  moonCut: {
    position: "absolute",
    top: 1,
    left: 9,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.recess
  }
});
