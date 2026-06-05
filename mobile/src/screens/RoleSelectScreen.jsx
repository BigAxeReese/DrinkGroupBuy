import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { customerUsers } from "../mock/customerUsers";
import { stores } from "../mock/stores";

export function RoleSelectScreen({ navigation }) {
  const loginOptions = useMemo(() => ([
    ...customerUsers.map((user) => ({
      key: `customer:${user.id}`,
      role: "customer",
      routeName: "nearby",
      params: { userId: user.id },
      label: `顧客｜${user.name}`,
      helper: "瀏覽附近優惠、加入團購、查看自己的訂單。"
    })),
    ...stores.map((store) => ({
      key: `merchant:${store.id}`,
      role: "merchant",
      routeName: "merchantDashboard",
      params: { storeId: store.id },
      label: `商家｜${store.name}`,
      helper: "管理商家首頁、開團與查看活動狀態。"
    })),
    {
      key: "admin:prototype",
      role: "admin",
      routeName: "adminDashboard",
      params: {},
      label: "管理員｜Prototype Admin",
      helper: "查看全平台團購、訂單與付款狀態。"
    }
  ]), []);
  const [selectedKey, setSelectedKey] = useState(loginOptions[0].key);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedOption = loginOptions.find((option) => option.key === selectedKey) ?? loginOptions[0];

  const login = () => {
    navigation.selectRole(
      selectedOption.role,
      selectedOption.routeName,
      selectedOption.params
    );
  };

  return (
    <MobileScreen title="登入">
      <Section title="選擇登入身分">
        <Text style={styles.description}>
          目前是 prototype 用的身分切換；未來會改成正式帳號密碼或第三方登入後，由後端判斷身分與權限。
        </Text>

        {Platform.OS === "web" ? (
          <select
            aria-label="選擇登入身分"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            style={styles.nativeSelect}
          >
            {loginOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMenuOpen((value) => !value)}
              style={({ pressed }) => [styles.selectBox, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.selectValue}>{selectedOption.label}</Text>
              <Text style={styles.chevron}>{menuOpen ? "⌃" : "⌄"}</Text>
            </Pressable>

            {menuOpen ? (
              <View style={styles.optionList}>
                {loginOptions.map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    key={option.key}
                    onPress={() => {
                      setSelectedKey(option.key);
                      setMenuOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      selectedKey === option.key && styles.activeOption,
                      pressed && styles.pressed
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.optionName, selectedKey === option.key && styles.activeOptionName]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}

        <PrimaryButton label="登入" onPress={login} />
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}>
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleText}>以 Google 登入（Prototype）</Text>
        </Pressable>
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  description: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20
  },
  nativeSelect: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
    paddingLeft: 8,
    paddingRight: 8
  },
  selectBox: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10
  },
  selectValue: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  chevron: {
    color: "#1f6feb",
    fontSize: 16,
    fontWeight: "900"
  },
  optionList: {
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff"
  },
  option: {
    minHeight: 34,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 10
  },
  activeOption: {
    backgroundColor: "#eff6ff"
  },
  optionName: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  activeOptionName: {
    color: "#1f6feb"
  },
  googleButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14
  },
  googleIcon: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  googleText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.75
  }
});
