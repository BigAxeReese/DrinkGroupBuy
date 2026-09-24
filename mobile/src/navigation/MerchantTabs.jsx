import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BottomNav } from "../components/BottomNav";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { MerchantCreateStack } from "./stacks/MerchantCreateStack";
import { MerchantDashboardStack } from "./stacks/MerchantDashboardStack";
import { tabSlideOptions } from "./tabSlideInterpolator";

const Tab = createBottomTabNavigator();

// The two merchant tabs (首頁／開團). Same persistent-tab and hardware-back behavior as CustomerTabs.
export function MerchantTabs() {
  const reduceMotion = useReduceMotion();

  return (
    <Tab.Navigator
      backBehavior="initialRoute"
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false, ...(reduceMotion ? null : tabSlideOptions) }}
    >
      <Tab.Screen name="MerchantDashboardTab" component={MerchantDashboardStack} />
      <Tab.Screen name="MerchantCreateTab" component={MerchantCreateStack} />
    </Tab.Navigator>
  );
}
