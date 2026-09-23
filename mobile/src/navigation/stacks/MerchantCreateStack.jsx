import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 開團 tab: its own root is the create-activity form.
export function MerchantCreateStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="merchantCreate" component={screens.merchantCreate} />
    </Stack.Navigator>
  );
}
