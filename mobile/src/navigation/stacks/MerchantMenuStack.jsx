import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 菜單 tab: its own root is the menu management screen.
export function MerchantMenuStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="merchantMenu" component={screens.merchantMenu} />
    </Stack.Navigator>
  );
}
