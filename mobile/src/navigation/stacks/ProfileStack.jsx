import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { screens } from "../screens";
import { stackScreenOptions } from "../stackOptions";

const Stack = createNativeStackNavigator();

// 個人中心 tab. Its "查看我的訂單" button switches to the Orders tab (see ProfileScreen.jsx) rather than
// pushing a copy of customerOrders in here, so this stack only ever holds its own root screen.
export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="profile" component={screens.profile} />
    </Stack.Navigator>
  );
}
