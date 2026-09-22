import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";

const roleLabels = {
  customer: "顧客",
  merchant: "店家",
  admin: "管理員"
};

export function ProfileScreen({ navigation, currentUserProfile, memberAction }) {
  if (!currentUserProfile) {
    return (
      <MobileScreen title="個人中心" onMemberPress={memberAction}>
        <Section title="會員資料">
          <Text style={styles.description}>找不到目前登入的會員資料，請重新登入。</Text>
          <PrimaryButton label="重新登入" onPress={() => navigation.replace("roleSelect")} />
        </Section>
      </MobileScreen>
    );
  }

  const roleText = (currentUserProfile.roles ?? []).map((role) => roleLabels[role] ?? role).join("、") || "—";
  const contactText = currentUserProfile.phoneNumber || currentUserProfile.email || "—";

  return (
    <MobileScreen title="個人中心" onMemberPress={memberAction}>
      <Section title="會員資料">
        <View style={styles.memberCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(currentUserProfile.displayName || "會").slice(0, 1)}</Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{currentUserProfile.displayName || "會員"}</Text>
            <Text style={styles.memberMeta}>{contactText}</Text>
            <Text style={styles.memberMeta}>身分：{roleText}</Text>
          </View>
        </View>
      </Section>

      <Section title="付款與取貨紀錄">
        <Text style={styles.description}>查看訂單狀態、付款結果與取貨憑證。</Text>
        <PrimaryButton label="查看我的訂單" onPress={() => navigation.replace("customerOrders")} />
      </Section>

      <Section title="帳號">
        <PrimaryButton label="登出" variant="secondary" onPress={() => navigation.logout()} />
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  description: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f6feb"
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900"
  },
  memberInfo: {
    flex: 1,
    gap: 3
  },
  memberName: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  memberMeta: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700"
  }
});
