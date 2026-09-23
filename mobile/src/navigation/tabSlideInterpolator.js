import { Dimensions } from "react-native";

// A left/right slide between tabs, driven by @react-navigation/bottom-tabs' own sceneStyleInterpolator:
// `progress` goes from -1 (this tab is to the left of the focused one) to 0 (focused) to 1 (to the
// right), animated on the native thread by react-navigation itself -- no Animated.timing/useNativeDriver
// wiring needed here, and no mount cost to fight, since react-native-screens keeps every visited tab
// mounted. Direction follows each tab's registration order in its Tab.Navigator, i.e. the order its
// <Tab.Screen> entries are listed in.
export function tabSlideInterpolator({ current: { progress } }) {
  const width = Dimensions.get("window").width;
  return {
    sceneStyle: {
      transform: [
        {
          translateX: progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width]
          })
        }
      ]
    }
  };
}
