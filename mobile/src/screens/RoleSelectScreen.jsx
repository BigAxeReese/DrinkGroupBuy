import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  getAuthMode,
  listDevAuthUsers,
  loginWithDevUser,
  loginWithFirebaseIdToken
} from "../utils/apiClient";
import { signOutFirebaseUser, useFirebaseGoogleLogin } from "../utils/firebaseAuth";
import { getRouteForUser } from "../utils/authRouting";

export function RoleSelectScreen(props) {
  const isDevAuthMode = getAuthMode() === "dev";

  if (isDevAuthMode) {
    return <RoleSelectContent {...props} isDevAuthMode />;
  }

  return <FirebaseRoleSelectScreen {...props} />;
}

function FirebaseRoleSelectScreen(props) {
  const googleLogin = useFirebaseGoogleLogin();
  return <RoleSelectContent {...props} isDevAuthMode={false} googleLogin={googleLogin} />;
}

function RoleSelectContent({ navigation, isDevAuthMode, googleLogin = null }) {
  const { signInWithGoogle } = googleLogin || {};
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [signedInUser, setSignedInUser] = useState(null);
  const [devUsers, setDevUsers] = useState([]);
  const [selectedDevUserId, setSelectedDevUserId] = useState("");
  const [isDevDropdownOpen, setIsDevDropdownOpen] = useState(false);
  const [isLoadingDevUsers, setIsLoadingDevUsers] = useState(false);
  const [devUsersRetryToken, setDevUsersRetryToken] = useState(0);

  useEffect(() => {
    if (!isDevAuthMode) return undefined;

    let isMounted = true;
    setIsLoadingDevUsers(true);
    setLoginError("");

    listDevAuthUsers()
      .then((users) => {
        if (!isMounted) return;
        // Admin has no entry point in the mobile app -- it moved to the /admin web console
        // (see backend/server.js) -- so this dev-only identity switcher shouldn't offer it.
        // Checks roles directly (not the derived, prioritized primaryRole) so a user who ever
        // carries "admin" alongside another role is still excluded.
        const selectableUsers = users.filter((user) => !user.roles.includes("admin"));
        setDevUsers(selectableUsers);
        setSelectedDevUserId((currentUserId) => currentUserId || selectableUsers[0]?.id || "");
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
  }, [isDevAuthMode, devUsersRetryToken]);

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
      navigation.selectRole(route.role, route.routeName, route.params, backendResult.user);
    } catch (error) {
      // Backing out of the account picker is a deliberate, ordinary choice -- showing a red
      // error banner for it would make the app look like it's complaining about nothing.
      if (error.code !== "cancelled") {
        setLoginError(getLoginErrorMessage(error));
      }
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
      navigation.selectRole(route.role, route.routeName, route.params, backendResult.user);
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <LoginHeroIllustration />
      </View>

      <View style={styles.actionStack}>
        {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

        {isDevAuthMode && loginError && !isLoadingDevUsers && devUsers.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDevUsersRetryToken((value) => value + 1)}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonLabel}>重試</Text>
          </Pressable>
        ) : null}

        {!isDevAuthMode ? (
          <LoginOptionButton
            icon="G"
            iconStyle={styles.googleIcon}
            label={isLoggingIn ? "登入中..." : "使用 Google 登入／註冊"}
            disabled={isLoggingIn}
            onPress={() => !isLoggingIn && login()}
          />
        ) : null}

        {signedInUser ? (
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {(signedInUser.backendUser?.displayName || signedInUser.displayName || signedInUser.email || "會").slice(0, 1)}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userLabel}>目前登入</Text>
              <Text numberOfLines={1} style={styles.userName}>
                {signedInUser.backendUser?.displayName || signedInUser.displayName || signedInUser.email}
              </Text>
              <Text numberOfLines={1} style={styles.userMeta}>
                {signedInUser.email || signedInUser.uid}
              </Text>
            </View>
          </View>
        ) : null}

        {!isDevAuthMode && signedInUser ? (
          <Pressable
            accessibilityRole="button"
            onPress={clearFirebaseSession}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          >
            <Text style={styles.textButtonLabel}>登出 Google 登入狀態</Text>
          </Pressable>
        ) : null}

        {isDevAuthMode ? (
          <View style={styles.devPanel}>
            <View style={styles.devHeader}>
              <Text style={styles.devTitle}>本機測試身份</Text>
              <Text style={styles.devBadge}>開發模式</Text>
            </View>
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
            <LoginOptionButton
              compact
              label={isLoadingDevUsers
                ? "讀取測試身份中..."
                : isLoggingIn
                  ? "切換身份中..."
                  : "登入"}
              disabled={isLoadingDevUsers || !selectedDevUserId || isLoggingIn}
              onPress={() => {
                if (!isLoggingIn && selectedDevUserId) {
                  devLogin();
                }
              }}
            />
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.go("merchantApply")}
        style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
      >
        <Text style={styles.textButtonLabel}>申請成為商家</Text>
      </Pressable>

      <Text style={styles.terms}>
        登入代表你同意<Text style={styles.termsLink}>服務條款</Text>與<Text style={styles.termsLink}>隱私政策</Text>
      </Text>
      <Text style={styles.version}>DrinkGroupBuy Prototype</Text>
    </ScrollView>
  );
}

function LoginHeroIllustration() {
  return (
    <View style={styles.illustration} accessibilityLabel="飲料團購插圖">
      <View style={styles.blob} />
      <View style={styles.smallBlobTop} />
      <View style={styles.smallBlobBottom} />
      <View style={styles.cup}>
        <View style={[styles.ticket, styles.ticketOne]}>
          <Text style={styles.ticketText}>折</Text>
        </View>
        <View style={[styles.ticket, styles.ticketTwo]}>
          <Text style={styles.ticketText}>省</Text>
        </View>
        <View style={[styles.ticket, styles.ticketThree]}>
          <Text style={styles.ticketText}>團</Text>
        </View>
        <View style={[styles.ticket, styles.ticketFour]}>
          <Text style={styles.ticketText}>買</Text>
        </View>
      </View>
      <View style={styles.lid} />
      <View style={styles.straw} />
      <View style={styles.flower}>
        <Text style={styles.flowerText}>米</Text>
      </View>
    </View>
  );
}

function LoginOptionButton({ icon, iconStyle, label, onPress, disabled = false, compact = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.loginButton,
        compact && styles.compactLoginButton,
        disabled && styles.loginButtonDisabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      {icon ? <Text style={[styles.loginIcon, compact && styles.compactLoginIcon, iconStyle]}>{icon}</Text> : null}
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.loginButtonLabel, compact && styles.compactLoginButtonLabel]}>{label}</Text>
    </Pressable>
  );
}

function getLoginErrorMessage(error) {
  if (error.payload?.error === "Invalid Firebase ID token") {
    return "Firebase 登入驗證失敗，請重新登入 Google。";
  }
  if (error.payload?.error === "This Google account is disabled") {
    return "這個 Google 帳號已被停用，如有疑問請聯絡管理員。";
  }
  if (error.payload?.error?.startsWith("This email is already linked to another account")) {
    return "這個 Email 已經連結到另一個帳號，請聯絡管理員處理。";
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
  screen: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingTop: 28,
    paddingBottom: 22
  },
  hero: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 14
  },
  illustration: {
    width: 282,
    height: 246,
    alignItems: "center",
    justifyContent: "center"
  },
  blob: {
    position: "absolute",
    width: 226,
    height: 166,
    borderRadius: 999,
    backgroundColor: "#37d39b",
    transform: [{ rotate: "8deg" }]
  },
  smallBlobTop: {
    position: "absolute",
    right: 34,
    top: 36,
    width: 58,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#2ecf93",
    transform: [{ rotate: "18deg" }]
  },
  smallBlobBottom: {
    position: "absolute",
    left: 36,
    bottom: 42,
    width: 74,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#37d39b",
    transform: [{ rotate: "28deg" }]
  },
  cup: {
    position: "absolute",
    bottom: 54,
    width: 92,
    height: 116,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 7,
    borderColor: "#27c7da",
    backgroundColor: "rgba(34, 211, 238, 0.72)"
  },
  lid: {
    position: "absolute",
    top: 76,
    width: 106,
    height: 18,
    borderRadius: 6,
    backgroundColor: "#6b7280"
  },
  straw: {
    position: "absolute",
    top: 42,
    width: 4,
    height: 38,
    borderRadius: 3,
    backgroundColor: "#087f5b"
  },
  flower: {
    position: "absolute",
    top: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f43f5e"
  },
  flowerText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  ticket: {
    position: "absolute",
    width: 52,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: "#16a34a",
    borderWidth: 2,
    borderColor: "#087f5b"
  },
  ticketOne: {
    left: 8,
    top: 22,
    transform: [{ rotate: "-18deg" }]
  },
  ticketTwo: {
    right: 7,
    top: 34,
    transform: [{ rotate: "14deg" }]
  },
  ticketThree: {
    left: 18,
    bottom: 28,
    transform: [{ rotate: "12deg" }]
  },
  ticketFour: {
    right: 15,
    bottom: 14,
    transform: [{ rotate: "-12deg" }]
  },
  ticketText: {
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "900"
  },
  actionStack: {
    gap: 14
  },
  loginButton: {
    minHeight: 58,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#c9c9c9",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18
  },
  compactLoginButton: {
    minHeight: 42,
    paddingHorizontal: 14
  },
  loginButtonDisabled: {
    opacity: 0.62
  },
  loginIcon: {
    position: "absolute",
    left: 18,
    width: 28,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900"
  },
  compactLoginIcon: {
    left: 14,
    fontSize: 17
  },
  googleIcon: {
    color: "#4285f4"
  },
  loginButtonLabel: {
    color: "#3a3a3f",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  compactLoginButtonLabel: {
    fontSize: 15
  },
  userCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8d8d8",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14b8a6"
  },
  userAvatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  userInfo: {
    flex: 1,
    gap: 3
  },
  userLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "900"
  },
  userName: {
    color: "#26262b",
    fontSize: 16,
    fontWeight: "900"
  },
  userMeta: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700"
  },
  textButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  textButtonLabel: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "900"
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    borderRadius: 6,
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  devPanel: {
    gap: 8,
    marginTop: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8d8d8",
    backgroundColor: "#fbfbfb",
    padding: 10
  },
  devHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  devTitle: {
    color: "#2f2f33",
    fontSize: 16,
    fontWeight: "900"
  },
  devBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#ccfbf1",
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  dropdown: {
    gap: 7
  },
  dropdownButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 5,
    borderWidth: 1.3,
    borderColor: "#c7c7c7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  dropdownTextGroup: {
    flex: 1,
    gap: 2,
    paddingRight: 10
  },
  dropdownLabel: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "900"
  },
  dropdownValue: {
    color: "#2f2f33",
    fontSize: 14,
    fontWeight: "900"
  },
  dropdownIcon: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "900"
  },
  optionList: {
    overflow: "hidden",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#d8d8d8",
    backgroundColor: "#ffffff"
  },
  option: {
    gap: 4,
    minHeight: 52,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  selectedOption: {
    backgroundColor: "#ecfdf5"
  },
  optionText: {
    color: "#2f2f33",
    fontSize: 14,
    fontWeight: "900"
  },
  optionMeta: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "700"
  },
  terms: {
    marginTop: 26,
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "center"
  },
  termsLink: {
    color: "#0f9f8f",
    fontWeight: "900"
  },
  version: {
    marginTop: 20,
    color: "#8a8a8f",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center"
  },
  pressed: {
    opacity: 0.72
  }
});
