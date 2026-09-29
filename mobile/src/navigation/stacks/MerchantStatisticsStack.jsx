import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 分析 tab: its own root is the store statistics screen.
export function MerchantStatisticsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="merchantStatistics" component={screens.merchantStatistics} />
    </Stack.Navigator>
  );
}
