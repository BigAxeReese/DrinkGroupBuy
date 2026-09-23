import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 即時地圖 tab: the map itself, and whatever a tapped store card leads to (its menu, its list of
// joinable activities, or straight to one activity's detail when it only has one) -- and, from there,
// the same full purchase path HomeStack offers (an activity found via the map can still be joined,
// paid for and picked up without ever switching tabs).
export function LiveMapStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="liveMap" component={screens.liveMap} />
      <Stack.Screen name="storeMenu" component={screens.storeMenu} />
      <Stack.Screen name="storeGroupBuyActivities" component={screens.storeGroupBuyActivities} />
      <Stack.Screen name="groupBuyActivityDetail" component={screens.groupBuyActivityDetail} />
      <Stack.Screen name="groupProgress" component={screens.groupProgress} />
      <Stack.Screen name="drinkSelection" component={screens.drinkSelection} />
      <Stack.Screen name="cart" component={screens.cart} />
      <Stack.Screen name="paymentAuthorization" component={screens.paymentAuthorization} />
      <Stack.Screen name="pickupInfo" component={screens.pickupInfo} />
    </Stack.Navigator>
  );
}
