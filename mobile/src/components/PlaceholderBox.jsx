import { StyleSheet, Text, View } from "react-native";

export function PlaceholderBox({ title, description }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 96,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    backgroundColor: "#f8fafc",
    padding: 14
  },
  title: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  description: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19
  }
});
