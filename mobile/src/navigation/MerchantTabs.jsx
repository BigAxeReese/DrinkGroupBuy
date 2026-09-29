import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BottomNav } from "../components/BottomNav";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { MerchantCreateStack } from "./stacks/MerchantCreateStack";
import { MerchantDashboardStack } from "./stacks/MerchantDashboardStack";
import { MerchantMenuStack } from "./stacks/MerchantMenuStack";
import { MerchantStatisticsStack } from "./stacks/MerchantStatisticsStack";
import { tabSlideOptions } from "./tabSlideInterpolator";

const Tab = createBottomTabNavigator();

// The four merchant tabs (首頁／開團／菜單／分析). Same persistent-tab and hardware-back behavior as
// CustomerTabs. 菜單／分析 used to be links pushed from the dashboard header; they moved here so
// they're reachable directly from the tab bar instead.
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
      <Tab.Screen name="MerchantMenuTab" component={MerchantMenuStack} />
      <Tab.Screen name="MerchantStatisticsTab" component={MerchantStatisticsStack} />
    </Tab.Navigator>
  );
}
