/**
 * Native-module stand-ins for component tests.
 *
 * Anything that renders `BottomSheetModal` pulls in Reanimated and Gesture
 * Handler, whose native halves do not exist under Jest — importing them throws
 * before a single assertion runs. Wiring the stand-ins here once keeps every
 * component test free of per-file plumbing, so a test's mocks stay about the
 * thing under test.
 *
 * Gesture Handler ships an official Jest setup and it is used as-is.
 * Reanimated's own `mock` entry point cannot be: since v4 it re-enters
 * `react-native-worklets`, which throws on a missing native half — the very
 * error the mock exists to avoid. So the surface `BottomSheetModal` actually
 * uses is stubbed by hand: shared values become plain boxes, animation helpers
 * return their target value immediately, and `Animated.View` is a plain View.
 * Nothing here animates, which is correct for assertions about what rendered.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native-gesture-handler/jestSetup");

jest.mock("react-native-reanimated", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");

  const passthrough = (toValue) => toValue;

  return {
    __esModule: true,
    default: {
      View,
      Text: View,
      ScrollView: View,
      Image: View,
      // Gesture Handler wraps its detector in an animated component at import
      // time, so this has to exist before any assertion runs.
      createAnimatedComponent: (component) => component,
    },
    createAnimatedComponent: (component) => component,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (factory) => factory(),
    useAnimatedRef: () => ({ current: null }),
    withSpring: passthrough,
    withTiming: passthrough,
    withDelay: (_delay, animation) => animation,
    withRepeat: (animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    interpolate: (value) => value,
    Easing: { linear: passthrough, ease: passthrough, out: passthrough, inOut: passthrough },
    FadeIn: {}, FadeOut: {}, Layout: {},
  };
});
