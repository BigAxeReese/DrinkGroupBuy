import { StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { useAppState } from "../state/AppStateContext";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";

export function ProfileScreen({ navigation, currentUserProfile, memberAction }) {
  const { logout } = useAppState();

  if (!currentUserProfile) {
    return (
      <MobileScreen title="個人中心" onMemberPress={memberAction}>
        <Section title="會員資料">
          <EmptyPanel>找不到目前登入的會員資料，請重新登入。</EmptyPanel>
          {/* Same "back to role select, keep session state" shortcut as the header member icon. */}
          <PrimaryButton label="重新登入" onPress={memberAction} />
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
        {/* Switches to the Orders tab (react-navigation bubbles a name it can't find in this
            screen's own stack up to the parent tab navigator) instead of pushing a second copy
            of customerOrders inside this tab's own stack. */}
        <PrimaryButton label="查看我的訂單" onPress={() => navigation.navigate("OrdersTab")} />
      </Section>

      <Section title="帳號">
        <PrimaryButton label="登出" variant="secondary" onPress={logout} />
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
