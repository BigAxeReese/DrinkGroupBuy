import { Dimensions, Easing } from "react-native";

// A left/right slide between tabs, driven by @react-navigation/bottom-tabs' own sceneStyleInterpolator:
// `progress` goes from -1 (this tab is to the left of the focused one) to 0 (focused) to 1 (to the
// right), animated on the native thread by react-navigation itself -- no Animated.timing/useNativeDriver
// wiring needed here, and no mount cost to fight, since react-native-screens keeps every visited tab
// mounted. Direction follows each tab's registration order in its Tab.Navigator, i.e. the order its
// <Tab.Screen> entries are listed in.
// bottom-tabs only runs sceneStyleInterpolator when the tab options also carry an `animation` or a
// `transitionSpec` (with neither, the default spec is a 0ms "none" and the interpolator is ignored), so
// the two always travel together. 220ms ease-out matches the slide this replaced.
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

export const tabSlideOptions = {
  sceneStyleInterpolator: tabSlideInterpolator,
  transitionSpec: {
    animation: "timing",
    config: { duration: 220, easing: Easing.out(Easing.cubic) }
  }
};
