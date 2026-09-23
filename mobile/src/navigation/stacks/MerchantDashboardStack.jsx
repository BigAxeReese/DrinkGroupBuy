import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 商家首頁 tab. Like OrdersStack, "merchantDashboard" is pushed a second time (with an `orderId` param)
// to show one history order's detail, giving that view a real stack entry instead of a local-state
// toggle the hardware back button could not see. "merchantCreate" here is the header "＋ 開團" shortcut
// (a separate mounted instance from the 開團 tab's own root, in MerchantCreateStack).
export function MerchantDashboardStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="merchantDashboard" component={screens.merchantDashboard} />
      <Stack.Screen name="merchantCreate" component={screens.merchantCreate} />
      <Stack.Screen name="merchantMenu" component={screens.merchantMenu} />
      <Stack.Screen name="merchantProductionList" component={screens.merchantProductionList} />
      <Stack.Screen name="merchantRefundRequests" component={screens.merchantRefundRequests} />
    </Stack.Navigator>
  );
}
