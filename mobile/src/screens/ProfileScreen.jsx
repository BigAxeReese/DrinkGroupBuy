import { StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";

export function ProfileScreen({ navigation, currentUserProfile, memberAction }) {
  if (!currentUserProfile) {
    return (
      <MobileScreen title="個人中心" onMemberPress={memberAction}>
        <Section title="會員資料">
          <EmptyPanel>找不到目前登入的會員資料，請重新登入。</EmptyPanel>
          <PrimaryButton label="重新登入" onPress={() => navigation.replace("roleSelect")} />
        </Section>
      </MobileScreen>
    );
  }

  const contactText = currentUserProfile.phoneNumber || currentUserProfile.email || "—";

  return (
    <MobileScreen title="個人中心" onMemberPress={memberAction}>
      <Section title="會員資料">
        <Card style={styles.memberCard}>
          <View style={styles.avatar}>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.avatarText}>{(currentUserProfile.displayName || "會").slice(0, 1)}</Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{currentUserProfile.displayName || "會員"}</Text>
            <Text style={styles.memberMeta}>{contactText}</Text>
          </View>
        </Card>
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
    ...typeScale.body,
    color: colors.textSecondary
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12
  },
  avatar: {
    width: sizes.tap,
    height: sizes.tap,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.recess
  },
  avatarText: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  memberInfo: {
    flex: 1,
    gap: spacing.s4
  },
  memberName: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  memberMeta: {
    ...typeScale.body,
    color: colors.textSecondary
  }
});
