import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BottomNav } from "../components/BottomNav";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { HomeStack } from "./stacks/HomeStack";
import { LiveMapStack } from "./stacks/LiveMapStack";
import { OrdersStack } from "./stacks/OrdersStack";
import { ProfileStack } from "./stacks/ProfileStack";
import { tabSlideOptions } from "./tabSlideInterpolator";

const Tab = createBottomTabNavigator();

// The four customer tabs (首頁／即時地圖／我的訂單／個人中心), each with its own nested push history that
// survives switching tabs (react-native-screens keeps every visited tab mounted, so switching back to
// one is instant -- no remount cost left to cause the stutter the slide used to fight). `backBehavior`
// makes the hardware back button jump to the first tab before falling through to the OS default (exit),
// matching the app's old custom BackHandler behavior at a stack root.
export function CustomerTabs() {
  const reduceMotion = useReduceMotion();

  return (
    <Tab.Navigator
      backBehavior="initialRoute"
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false, ...(reduceMotion ? null : tabSlideOptions) }}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="LiveMapTab" component={LiveMapStack} />
      <Tab.Screen name="OrdersTab" component={OrdersStack} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} />
    </Tab.Navigator>
  );
}
