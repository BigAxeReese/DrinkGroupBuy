import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const { colors, isDark } = useTheme();
  // The area behind the status bar and the system navigation bar (the safe-area insets) is the page colour.
  const pageColor = colors.page;

  const app = (
    // react-navigation's native-stack/bottom-tabs use react-native-gesture-handler (swipe-back, tab
    // press feedback) internally; it requires this root wrapper somewhere above the whole app.
    <GestureHandlerRootView style={styles.safeArea}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: pageColor }]} edges={["top", "bottom", "left", "right"]}>
          <StatusBar style={isDark ? "light" : "dark"} backgroundColor={pageColor} translucent={false} />
          <AppNavigator />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.webPreview}>
        <style>{`
          .drink-group-buy-map-label {
            margin-top: 10px;
            padding: 3px 6px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.22);
            white-space: nowrap;
          }
        `}</style>
        <View style={[styles.phoneFrame, { backgroundColor: pageColor }]}>
          {app}
        </View>
      </View>
    );
  }

  return (
    app
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  webPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    padding: 20
  },
  phoneFrame: {
    width: 390,
    height: 820,
    maxHeight: "100%",
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#020617",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 }
  }
});
