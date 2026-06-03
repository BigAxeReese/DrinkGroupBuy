import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";

export function RoleSelectScreen({ navigation }) {
  return (
    <MobileScreen title="登入">
      <Section title="顧客登入">
        <Text style={styles.description}>
          瀏覽附近優惠、加入團購、查看進度、付款預授權與取貨資訊。
        </Text>
        <PrimaryButton label="以顧客身分進入" onPress={() => navigation.selectRole("customer", "nearby")} />
      </Section>

      <Section title="商家登入">
        <Text style={styles.description}>
          查看活動儀表板、建立優惠活動與檢視參與狀態。
        </Text>
        <PrimaryButton label="以商家身分進入" onPress={() => navigation.selectRole("merchant", "merchantDashboard")} />
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  description: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22
  }
});
