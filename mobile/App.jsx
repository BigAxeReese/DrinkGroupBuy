import { StatusBar } from "expo-status-bar";
import { Platform, SafeAreaView, StyleSheet, View } from "react-native";
import { AppNavigator } from "./src/navigation/AppNavigator";

export default function App() {
  const app = (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaView>
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.webPreview}>
        <View style={styles.phoneFrame}>
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
    flex: 1,
    backgroundColor: "#f6f8fb"
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
    backgroundColor: "#f6f8fb",
    borderWidth: 3,
    borderColor: "#020617",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 }
  }
});
