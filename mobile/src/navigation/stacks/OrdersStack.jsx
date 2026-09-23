import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 我的訂單 tab. "customerOrders" is registered once but pushed a SECOND time (with an `orderId` param)
// to show one order's detail -- CustomerOrdersScreen.jsx reads route.params?.orderId to pick which
// view to render, so this single registration gives the detail view its own real stack entry (the
// hardware back button now pops it correctly, instead of the old local-state toggle it could not see).
export function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="customerOrders" component={screens.customerOrders} />
      <Stack.Screen name="groupBuyActivityDetail" component={screens.groupBuyActivityDetail} />
      <Stack.Screen name="groupProgress" component={screens.groupProgress} />
      <Stack.Screen name="drinkSelection" component={screens.drinkSelection} />
      <Stack.Screen name="cart" component={screens.cart} />
      <Stack.Screen name="paymentAuthorization" component={screens.paymentAuthorization} />
      <Stack.Screen name="pickupInfo" component={screens.pickupInfo} />
    </Stack.Navigator>
  );
}
