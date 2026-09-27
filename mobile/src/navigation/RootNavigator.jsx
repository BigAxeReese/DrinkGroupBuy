import { useEffect, useMemo, useRef } from "react";
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { AppStateProvider } from "../state/AppStateProvider";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { CustomerTabs } from "./CustomerTabs";
import { MerchantTabs } from "./MerchantTabs";
import { parseLinePayResultDeepLink } from "./linking";
import { screens } from "./screens";
import { stackScreenOptions } from "./stackOptions";

const Stack = createNativeStackNavigator();

// Replaces the old AppNavigator.js. All the app's shared state/actions moved to AppStateProvider; this
// file is only the navigation shell: which root screen shows (pre-role stack, customer tabs, or
// merchant tabs) and the LINE Pay deep link.
export function AppNavigator() {
  const navigationRef = useNavigationContainerRef();

  return (
    <AppStateProvider>
      <RootNavigatorInner navigationRef={navigationRef} />
    </AppStateProvider>
  );
}

function RootNavigatorInner({ navigationRef }) {
  const { sessionRestoreStatus, currentRole, showingRoleSelect, actions } = useAppState();
  const { colors, isDark } = useTheme();
  // react-navigation paints its own light-grey background behind screens and during stack / tab
  // transitions; it has to follow the theme or dark mode shows light gaps.
  const navigationTheme = useMemo(() => ({
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.accent,
      background: colors.page,
      card: colors.page,
      text: colors.text,
      border: colors.lineDecor,
      notification: colors.accent
    }
  }), [colors, isDark]);

  // A LINE Pay result link can arrive before the customer navigator exists (cold start while the
  // session is still being restored, or before any role is chosen), so it is parked in
  // pendingDeepLinkRef and applied by flushPendingDeepLink once CustomerTabs is mounted. Each raw URL
  // is handled once: on Android getInitialURL() keeps returning the launch URL, so without
  // handledDeepLinkRef every re-subscription would navigate back to the payment screen again.
  const handledDeepLinkRef = useRef(null);
  const pendingDeepLinkRef = useRef(null);
  const actionsRef = useRef(actions);
  const flushPendingDeepLinkRef = useRef(() => {});

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  function flushPendingDeepLink() {
    const deepLink = pendingDeepLinkRef.current;
    if (!deepLink) return;
    if (!navigationRef.isReady() || currentRole !== "customer" || showingRoleSelect) return;
    pendingDeepLinkRef.current = null;

    const mode = deepLink.paymentFlow === "direct_repayment" ? "manualRepayment" : undefined;
    // Pushes onto the Orders tab's own stack (rather than the old behavior of discarding the whole
    // app stack via `replace`) so switching tabs afterwards still returns to wherever the customer
    // was, matching the "keep each tab's own history" choice made for the rest of this migration.
    navigationRef.navigate("CustomerTabs", {
      screen: "OrdersTab",
      params: {
        screen: "paymentAuthorization",
        params: {
          orderId: deepLink.orderId,
          mode,
          linePayResultStatus: deepLink.status,
          linePayPaymentFlow: deepLink.paymentFlow,
          linePayTransactionId: deepLink.transactionId,
          linePayError: deepLink.error,
          paymentResultSource: deepLink.source
        }
      }
    });
    actionsRef.current.syncOrderFromBackend(deepLink.orderId).catch(() => {
      // PaymentAuthorizationScreen still allows manual refresh when auth/session state is not ready.
    });
  }

  useEffect(() => {
    flushPendingDeepLinkRef.current = flushPendingDeepLink;
  });

  useEffect(() => {
    function handleIncomingUrl(rawUrl) {
      const deepLink = parseLinePayResultDeepLink(rawUrl);
      if (!deepLink) return;
      if (handledDeepLinkRef.current === rawUrl) return;
      handledDeepLinkRef.current = rawUrl;

      pendingDeepLinkRef.current = deepLink;
      flushPendingDeepLinkRef.current();
    }

    Linking.getInitialURL()
      .then(handleIncomingUrl)
      .catch(() => {});

    const subscription = Linking.addEventListener("url", (event) => {
      handleIncomingUrl(event.url);
    });

    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    flushPendingDeepLink();
  }, [sessionRestoreStatus, currentRole, showingRoleSelect]);

  if (sessionRestoreStatus === "checking") {
    return (
      <View style={[styles.container, styles.sessionCheckContainer, { backgroundColor: colors.page }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flushPendingDeepLink}>
      <Stack.Navigator screenOptions={stackScreenOptions}>
        {!currentRole || showingRoleSelect ? (
          <Stack.Group>
            <Stack.Screen name="roleSelect" component={screens.roleSelect} />
            <Stack.Screen name="merchantApply" component={screens.merchantApply} />
          </Stack.Group>
        ) : currentRole === "merchant" ? (
          <Stack.Screen name="MerchantTabs" component={MerchantTabs} />
        ) : (
          <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  sessionCheckContainer: {
    alignItems: "center",
    justifyContent: "center"
  }
});
