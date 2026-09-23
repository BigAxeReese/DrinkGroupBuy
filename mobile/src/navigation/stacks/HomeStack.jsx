import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// The 首頁 tab's own push history: home -> a group-buy's detail/progress -> pick drinks -> cart ->
// pay -> pickup info. Switching to another tab and back keeps whatever depth this stack was at.
export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="nearby" component={screens.nearby} />
      <Stack.Screen name="groupBuyActivityDetail" component={screens.groupBuyActivityDetail} />
      <Stack.Screen name="groupProgress" component={screens.groupProgress} />
      <Stack.Screen name="drinkSelection" component={screens.drinkSelection} />
      <Stack.Screen name="cart" component={screens.cart} />
      <Stack.Screen name="paymentAuthorization" component={screens.paymentAuthorization} />
      <Stack.Screen name="pickupInfo" component={screens.pickupInfo} />
    </Stack.Navigator>
  );
}
