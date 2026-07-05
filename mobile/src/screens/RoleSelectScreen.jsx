import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { loginWithFirebaseIdToken } from "../utils/apiClient";
import { signOutFirebaseUser, useFirebaseGoogleLogin } from "../utils/firebaseAuth";

const backendCustomerToPrototypeCustomer = {
  "user-customer-yinji": "customer-yinji",
  "user-customer-bolun": "customer-bolun",
  "user-customer-lixuan": "customer-lixuan",
  "user-customer-jingwei": "customer-jingwei"
};

export function RoleSelectScreen({ navigation }) {
  const { redirectUri, signInWithGoogle } = useFirebaseGoogleLogin();
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [signedInUser, setSignedInUser] = useState(null);

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

  const clearFirebaseSession = async () => {
    await signOutFirebaseUser();
    setSignedInUser(null);
    setLoginError("");
  };

  return (
    <MobileScreen title="Sign in">
      <Section title="Google Login">
        <Text style={styles.description}>
          Sign in with a Google test account. The backend resolves customer,
          merchant, or admin access from the mapped Firebase UID.
        </Text>

        {signedInUser ? (
          <View style={styles.userCard}>
            <Text style={styles.userLabel}>Signed in</Text>
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
          label={isLoggingIn ? "Signing in..." : "Continue with Google"}
          onPress={() => !isLoggingIn && login()}
        />

        {redirectUri ? (
          <View style={styles.redirectCard}>
            <Text style={styles.redirectLabel}>OAuth redirect URI</Text>
            <Text selectable style={styles.redirectValue}>{redirectUri}</Text>
          </View>
        ) : null}

        {signedInUser ? (
          <Pressable
            accessibilityRole="button"
            onPress={clearFirebaseSession}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Sign out Google session</Text>
          </Pressable>
        ) : null}
      </Section>
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
  throw new Error("No supported role is active for this account");
}

function getLoginErrorMessage(error) {
  if (error.payload?.nextStep) {
    return `${error.message}. ${error.payload.nextStep}`;
  }
  return error.message || "Google login failed";
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
