import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { customerUsers } from "../mock/customerUsers";
import { stores } from "../mock/stores";
import { login as loginApi } from "../utils/apiClient";

const customerAccountMap = {
  "customer-yinji": { phoneNumber: "0911000001", password: "customer1" },
  "customer-bolun": { phoneNumber: "0911000002", password: "customer2" },
  "customer-lixuan": { phoneNumber: "0911000003", password: "customer3" },
  "customer-jingwei": { phoneNumber: "0911000004", password: "customer4" }
};

const merchantAccountMap = {
  "store-001": { email: "store1@example.com", password: "merchant1" },
  "store-002": { email: "store2@example.com", password: "merchant2" },
  "store-003": { email: "store3@example.com", password: "merchant3" },
  "store-004": { email: "store4@example.com", password: "merchant4" },
  "store-005": { email: "store5@example.com", password: "merchant5" },
  "store-006": { email: "store6@example.com", password: "merchant6" },
  "store-007": { email: "store7@example.com", password: "merchant7" }
};

const adminAccount = {
  email: "admin@example.com",
  password: "admin1"
};

export function RoleSelectScreen({ navigation }) {
  const loginOptions = useMemo(() => ([
    ...customerUsers.map((user) => {
      const account = customerAccountMap[user.id] ?? customerAccountMap["customer-yinji"];
      return {
        key: `customer:${user.id}`,
        identifierType: "phone",
        identifierLabel: "手機號碼",
        identifierValue: account.phoneNumber,
        password: account.password,
        role: "customer",
        routeName: "nearby",
        params: { userId: user.id },
        label: `顧客 ${user.name}`,
        helper: "顧客使用手機號碼與密碼登入。"
      };
    }),
    ...stores.map((store) => {
      const account = merchantAccountMap[store.id] ?? merchantAccountMap["store-001"];
      return {
        key: `merchant:${store.id}`,
        identifierType: "email",
        identifierLabel: "商家 Email",
        identifierValue: account.email,
        password: account.password,
        role: "merchant",
        routeName: "merchantDashboard",
        params: { storeId: store.id },
        label: `商家 ${store.name}`,
        helper: "商家使用 Email 與密碼登入，一組 Email 對應一間店。"
      };
    }),
    {
      key: "admin:prototype",
      identifierType: "email",
      identifierLabel: "管理員 Email",
      identifierValue: adminAccount.email,
      password: adminAccount.password,
      role: "admin",
      routeName: "adminDashboard",
      params: {},
      label: "管理員",
      helper: "管理員使用 Email 與密碼登入。"
    }
  ]), []);
  const [selectedKey, setSelectedKey] = useState(loginOptions[0].key);
  const [identifier, setIdentifier] = useState(loginOptions[0].identifierValue);
  const [password, setPassword] = useState(loginOptions[0].password);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedOption = loginOptions.find((option) => option.key === selectedKey) ?? loginOptions[0];

  const selectLoginOption = (optionKey) => {
    const option = loginOptions.find((item) => item.key === optionKey) ?? loginOptions[0];
    setSelectedKey(option.key);
    setIdentifier(option.identifierValue);
    setPassword(option.password);
    setLoginError("");
    setMenuOpen(false);
  };

  const login = async () => {
    try {
      setIsLoggingIn(true);
      setLoginError("");
      const result = await loginApi({
        phoneNumber: selectedOption.identifierType === "phone" ? identifier : undefined,
        email: selectedOption.identifierType === "email" ? identifier : undefined,
        password
      });
      const route = getRouteForUser(result.user, selectedOption);
      navigation.selectRole(route.role, route.routeName, route.params);
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <MobileScreen title="登入">
      <Section title="選擇測試身份">
        <Text style={styles.description}>
          顧客使用手機號碼登入；商家與管理員使用 Email 登入。這個設計之後較容易接 Firebase Auth。
        </Text>

        {Platform.OS === "web" ? (
          <select
            aria-label="選擇測試身份"
            value={selectedKey}
            onChange={(event) => selectLoginOption(event.target.value)}
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
              <Text style={styles.chevron}>{menuOpen ? "▲" : "▼"}</Text>
            </Pressable>

            {menuOpen ? (
              <View style={styles.optionList}>
                {loginOptions.map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    key={option.key}
                    onPress={() => selectLoginOption(option.key)}
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

        <View style={styles.accountCard}>
          <Text style={styles.accountLabel}>{selectedOption.identifierLabel}</Text>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={selectedOption.identifierLabel}
            keyboardType={selectedOption.identifierType === "phone" ? "phone-pad" : "email-address"}
            autoCapitalize="none"
            style={styles.textInput}
          />
          <Text style={styles.accountHelper}>{selectedOption.helper}</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>密碼</Text>
          <View style={styles.passwordRow}>
            <TextInput
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              placeholder="請輸入密碼"
              style={styles.passwordInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? "隱藏密碼" : "顯示密碼"}
              onPress={() => setPasswordVisible((value) => !value)}
              style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
            >
              <Text style={styles.eyeText}>{passwordVisible ? "🙈" : "👁"}</Text>
            </Pressable>
          </View>
        </View>
        {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

        <PrimaryButton label={isLoggingIn ? "登入中..." : "登入"} onPress={() => !isLoggingIn && login()} />
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}>
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleText}>使用 Google 登入（尚未啟用）</Text>
        </Pressable>
      </Section>
    </MobileScreen>
  );
}

function getRouteForUser(user, selectedOption) {
  if (selectedOption.role === "admin" && user.roles.includes("admin")) {
    return { role: "admin", routeName: "adminDashboard", params: {} };
  }
  if (selectedOption.role === "merchant" && user.roles.includes("merchant")) {
    return {
      role: "merchant",
      routeName: "merchantDashboard",
      params: { storeId: user.merchantStores?.[0]?.id ?? selectedOption.params.storeId }
    };
  }
  if (selectedOption.role === "customer" && user.roles.includes("customer")) {
    return {
      role: "customer",
      routeName: "nearby",
      params: selectedOption.params
    };
  }
  throw new Error("此帳號沒有對應的登入權限");
}

const styles = StyleSheet.create({
  description: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20
  },
  fieldGroup: {
    gap: 6
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  accountCard: {
    gap: 5,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 12
  },
  accountLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  accountHelper: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18
  },
  textInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 10
  },
  passwordRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    paddingLeft: 10,
    paddingRight: 4
  },
  passwordInput: {
    flex: 1,
    minHeight: 40,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 0
  },
  eyeButton: {
    minHeight: 36,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9
  },
  eyeText: {
    fontSize: 16
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "900"
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
    fontSize: 12,
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
