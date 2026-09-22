import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, Easing, Platform, StyleSheet, View } from "react-native";
import { getSlideDirection } from "./slideTransition";

const SLIDE_DURATION_MS = 220;
const WATCHDOG_MARGIN_MS = 300;

// Shows the screen of the current route. Moving between two bottom-navigation tabs keeps the old screen
// on for a moment and slides old and new sideways together (getSlideDirection picks the direction).
// Every other route change swaps instantly, as before. Layers are keyed by route NAME, so an entry with
// the same name (new params, tapping the active tab again) keeps its mounted screen and its state.
export function ScreenTransition({ current, renderScreen, duration = SLIDE_DURATION_MS }) {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [state, setState] = useState({ shown: current, leaving: null, direction: 0, progress: null, contentReady: true });

  // Adjusting state while rendering (instead of in an effect) means the first frame of the new screen is
  // already at its starting position, not flashing at its final one.
  if (state.shown !== current) {
    setState(getNextState(state, current, reduceMotion));
  }

  const { shown, leaving, direction, progress, contentReady } = state;

  // Mounting the destination screen (a data-heavy list, or the native map) is synchronous work that can
  // block the UI thread for the first frames of the slide, which is what makes it stutter. Letting the
  // slide's native-driven transform get moving for one frame BEFORE that mount happens gives the
  // animation a head start it can keep even while the mount briefly blocks the thread afterwards.
  useEffect(() => {
    if (contentReady) return undefined;
    const frame = requestAnimationFrame(() => {
      setState((latest) => (latest.shown === shown ? { ...latest, contentReady: true } : latest));
    });
    return () => cancelAnimationFrame(frame);
  }, [contentReady, shown]);

  useEffect(() => {
    if (!progress) return undefined;
    const finish = () => setState((latest) => (latest.progress === progress ? { ...latest, leaving: null, progress: null, contentReady: true } : latest));
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web"
    });
    animation.start(({ finished }) => {
      if (finished) finish();
    });
    // If the platform never reports the end of the slide (app sent to the background mid-slide, a frame
    // clock that stalls), the old screen must not stay on top of the new one.
    const watchdog = setTimeout(finish, duration + WATCHDOG_MARGIN_MS);
    return () => {
      clearTimeout(watchdog);
      animation.stop();
    };
  }, [progress, duration]);

  const distance = (width || Dimensions.get("window").width) * direction;
  const enterStyle = progress && { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] };
  const leaveStyle = progress && { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) }] };

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.host}>
      {leaving ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          key={leaving.name}
          style={[styles.layer, styles.leaving, leaveStyle]}
        >
          {renderScreen(leaving)}
        </Animated.View>
      ) : null}
      <Animated.View key={shown.name} style={[styles.layer, enterStyle]}>
        {contentReady ? renderScreen(shown) : null}
      </Animated.View>
    </View>
  );
}

function getNextState(state, current, reduceMotion) {
  if (state.shown.name === current.name) return { ...state, shown: current };
  const direction = reduceMotion ? 0 : getSlideDirection(state.shown.name, current.name);
  if (!direction) return { shown: current, leaving: null, direction: 0, progress: null, contentReady: true };
  return { shown: current, leaving: state.shown, direction, progress: new Animated.Value(0), contentReady: false };
}

// The system "remove animations" setting turns the slide off. If the setting cannot be read the slide
// simply stays on, which is the default behaviour.
function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    overflow: "hidden"
  },
  layer: StyleSheet.absoluteFillObject,
  leaving: {
    pointerEvents: "none"
  }
});
