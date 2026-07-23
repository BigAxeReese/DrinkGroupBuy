import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import {
  getAuthMode,
  listDevAuthUsers,
  loginWithDevUser,
  loginWithFirebaseIdToken
} from "../utils/apiClient";
import { signOutFirebaseUser, useFirebaseGoogleLogin } from "../utils/firebaseAuth";

const backendCustomerToPrototypeCustomer = {
  "user-customer-yinji": "customer-yinji",
  "user-customer-bolun": "customer-bolun",
  "user-customer-lixuan": "customer-lixuan",
  "user-customer-jingwei": "customer-jingwei"
};

export function RoleSelectScreen({ navigation }) {
  const { redirectUri, signInWithGoogle } = useFirebaseGoogleLogin();
  const isDevAuthMode = getAuthMode() === "dev";
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [signedInUser, setSignedInUser] = useState(null);
  const [devUsers, setDevUsers] = useState([]);
  const [selectedDevUserId, setSelectedDevUserId] = useState("");
  const [isDevDropdownOpen, setIsDevDropdownOpen] = useState(false);
  const [isLoadingDevUsers, setIsLoadingDevUsers] = useState(false);

  useEffect(() => {
    if (!isDevAuthMode) return undefined;

    let isMounted = true;
    setIsLoadingDevUsers(true);
    setLoginError("");

    listDevAuthUsers()
      .then((users) => {
        if (!isMounted) return;
        setDevUsers(users);
        setSelectedDevUserId((currentUserId) => currentUserId || users[0]?.id || "");
      })
      .catch((error) => {
        if (!isMounted) return;
        setLoginError(getDevLoginErrorMessage(error));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingDevUsers(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isDevAuthMode]);

  const login = async () => {
    try {
      setIsLoggingIn(true);
      setLoginError("");

      const firebaseResult = await signInWithGoogle();
      const backendResult = await loginWithFirebaseIdToken(firebaseResult.firebaseIdToken);
      setSignedInUser({
        ...firebaseResult.firebaseUser,
        backendUser: backendResult.user
      });

      const route = getRouteForUser(backendResult.user);
      navigation.selectRole(route.role, route.routeName, route.params);
    } catch (error) {
      setLoginError(getLoginErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const devLogin = async () => {
    try {
      setIsLoggingIn(true);
      setLoginError("");

      const backendResult = await loginWithDevUser(selectedDevUserId);
      setSignedInUser({
        uid: backendResult.user.id,
        email: backendResult.user.email,
        displayName: backendResult.user.displayName,
        backendUser: backendResult.user
      });

      const route = getRouteForUser(backendResult.user);
      navigation.selectRole(route.role, route.routeName, route.params);
    } catch (error) {
      setLoginError(getDevLoginErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const clearFirebaseSession = async () => {
    await signOutFirebaseUser();
    setSignedInUser(null);
    setLoginError("");
  };

  return (
    <MobileScreen title="登入">
      <Section title="Google 登入">
        <Text style={styles.description}>
          使用 Google 測試帳號登入。後端會依 Firebase UID 對應顧客或商家身份。
        </Text>

        {signedInUser ? (
          <View style={styles.userCard}>
            <Text style={styles.userLabel}>目前登入</Text>
            <Text numberOfLines={1} style={styles.userName}>
              {signedInUser.backendUser?.displayName || signedInUser.displayName || signedInUser.email}
            </Text>
            <Text numberOfLines={1} style={styles.userMeta}>
              {signedInUser.email || signedInUser.uid}
            </Text>
          </View>
        ) : null}

        {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

        <PrimaryButton
          label={isLoggingIn ? "登入中..." : "使用 Google 繼續"}
          onPress={() => !isLoggingIn && login()}
        />

        {redirectUri ? (
          <View style={styles.redirectCard}>
            <Text style={styles.redirectLabel}>OAuth 回呼網址</Text>
            <Text selectable style={styles.redirectValue}>{redirectUri}</Text>
          </View>
        ) : null}

        {signedInUser ? (
          <Pressable
            accessibilityRole="button"
            onPress={clearFirebaseSession}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>登出 Google 登入狀態</Text>
          </Pressable>
        ) : null}
      </Section>

      {isDevAuthMode ? (
        <Section title="本機測試身份">
          <Text style={styles.description}>
            只在開發模式顯示。正式環境仍只使用 Google 登入。
          </Text>
          <DevIdentityDropdown
            users={devUsers}
            selectedUserId={selectedDevUserId}
            isOpen={isDevDropdownOpen}
            onToggle={() => setIsDevDropdownOpen((value) => !value)}
            onSelect={(userId) => {
              setSelectedDevUserId(userId);
              setIsDevDropdownOpen(false);
            }}
          />
          <PrimaryButton
            label={isLoadingDevUsers
              ? "讀取測試身份中..."
              : isLoggingIn
                ? "切換身份中..."
                : "使用選取身份進入"}
            disabled={isLoadingDevUsers || !selectedDevUserId}
            onPress={() => {
              if (!isLoggingIn && selectedDevUserId) {
                devLogin();
              }
            }}
          />
        </Section>
      ) : null}
    </MobileScreen>
  );
}

function getRouteForUser(user) {
  if (user.roles.includes("admin")) {
    return { role: "admin", routeName: "adminDashboard", params: {} };
  }
  if (user.roles.includes("merchant")) {
    return {
      role: "merchant",
      routeName: "merchantDashboard",
      params: { storeId: user.merchantStores?.[0]?.id ?? "store-001" }
    };
  }
  if (user.roles.includes("customer")) {
    return {
      role: "customer",
      routeName: "nearby",
      params: {
        userId: backendCustomerToPrototypeCustomer[user.id] ?? "customer-yinji"
      }
    };
  }
  throw new Error("這個帳號沒有可進入 App 的有效身份");
}

function getLoginErrorMessage(error) {
  if (error.payload?.nextStep) {
    return `${error.message}. ${error.payload.nextStep}`;
  }
  if (error.payload?.error === "Invalid Firebase ID token") {
    return "Firebase 登入驗證失敗，請重新登入 Google。";
  }
  if (error.payload?.error === "Firebase user is not mapped to an active backend user") {
    return "這個 Google 帳號尚未對應到本機使用者，請先把 Firebase UID 寫入資料庫。";
  }
  return error.message || "Google 登入失敗";
}

function getDevLoginErrorMessage(error) {
  if (error.payload?.error === "Not found") {
    return "後端尚未開啟 AUTH_DEV_MODE=true，無法使用本機測試身份。";
  }
  return getLoginErrorMessage(error);
}

function DevIdentityDropdown({ users, selectedUserId, isOpen, onToggle, onSelect }) {
  const selectedUser = users.find((user) => user.id === selectedUserId);

  return (
    <View style={styles.dropdown}>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [styles.dropdownButton, pressed && styles.pressed]}
      >
        <View style={styles.dropdownTextGroup}>
          <Text style={styles.dropdownLabel}>測試身份</Text>
          <Text numberOfLines={1} style={styles.dropdownValue}>
            {selectedUser ? selectedUser.label : "沒有可用身份"}
          </Text>
        </View>
        <Text style={styles.dropdownIcon}>{isOpen ? "▲" : "▼"}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.optionList}>
          {users.map((user) => (
            <Pressable
              key={user.id}
              accessibilityRole="button"
              onPress={() => onSelect(user.id)}
              style={({ pressed }) => [
                styles.option,
                user.id === selectedUserId && styles.selectedOption,
                pressed && styles.pressed
              ]}
            >
              <Text numberOfLines={1} style={styles.optionText}>{user.label}</Text>
              <Text numberOfLines={1} style={styles.optionMeta}>
                {getDevUserMeta(user)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function getDevUserMeta(user) {
  if (user.primaryRole === "merchant") {
    const store = user.merchantStores?.[0];
    return store ? `${user.id} / ${store.id}` : user.id;
  }
  return `${user.id} / ${user.roles.join(", ")}`;
}

const styles = StyleSheet.create({
  description: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20
  },
  userCard: {
    gap: 5,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 12
  },
  userLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  userName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  userMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 18
  },
  secondaryButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14
  },
  dropdown: {
    gap: 8
  },
  dropdownButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  dropdownTextGroup: {
    flex: 1,
    gap: 4,
    paddingRight: 10
  },
  dropdownLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  dropdownValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  dropdownIcon: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "900"
  },
  optionList: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe3ef",
    backgroundColor: "#ffffff"
  },
  option: {
    gap: 4,
    minHeight: 52,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  selectedOption: {
    backgroundColor: "#eff6ff"
  },
  optionText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  optionMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  redirectCard: {
    gap: 5,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    padding: 10
  },
  redirectLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  redirectValue: {
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.75
  }
});
