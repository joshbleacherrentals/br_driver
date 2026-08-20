import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Holds its children briefly, then dissolves them into drifting motes.
 *
 * The "turning to dust" read comes from three cheap things layered together,
 * not from a particle engine: the content fades and drifts as one, a scatter of
 * small squares fades *in* over it as it goes (so the pill looks like it is
 * coming apart rather than merely fading), and every mote's start is staggered
 * by its horizontal position, which sweeps the disintegration left to right.
 *
 * Everything is driven from one shared value on the UI thread — each mote reads
 * its own slice of the same 0…1 progress — so the cost is one timing animation
 * regardless of how many motes there are, and no JS-thread work at all until
 * the final callback.
 *
 * A driver may see this many times a day, so it is deliberately short and
 * quiet. `useReducedMotion()` (already the convention in
 * `features/side-navigation/components/ThemeToggle.tsx`) skips the animation
 * outright: the content is simply shown for the hold and then removed.
 */

const HOLD_MS = 1100;
const DISSOLVE_MS = 780;
const MOTE_COUNT = 18;

type Mote = {
  /** Position within the dissolving content, in percent. */
  left: number;
  top: number;
  size: number;
  /** Total drift, in points. Outward and slightly up, like settling dust. */
  dx: number;
  dy: number;
  /** Fraction of the dissolve elapsed before this mote starts (0…~0.5). */
  delay: number;
};

/**
 * Deterministic scatter, computed once at module load.
 *
 * Seeded rather than `Math.random()` so the effect is identical on every
 * appearance — a layout that reshuffles each time reads as noise, and it also
 * keeps this module free of render-time randomness.
 */
const MOTES: Mote[] = (() => {
  let seed = 20260820;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  return Array.from({ length: MOTE_COUNT }, () => {
    const left = 3 + random() * 94;
    return {
      left,
      top: 8 + random() * 84,
      size: 2 + random() * 3.5,
      // Drift grows toward the trailing edge, so the far side scatters widest.
      dx: 12 + random() * 26 + (left / 100) * 22,
      dy: -(4 + random() * 24),
      delay: (left / 100) * 0.34 + random() * 0.1,
    };
  });
})();

function DustMote({
  mote,
  progress,
  color,
}: {
  mote: Mote;
  progress: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    // Each mote's own 0…1 life, carved out of the shared progress.
    const span = Math.max(0.001, 1 - mote.delay);
    const local = Math.min(1, Math.max(0, (progress.value - mote.delay) / span));

    return {
      opacity: interpolate(local, [0, 0.25, 1], [0, 0.85, 0]),
      transform: [
        { translateX: local * mote.dx },
        { translateY: local * mote.dy },
        { scale: interpolate(local, [0, 1], [1, 0.3]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: `${mote.left}%`,
          top: `${mote.top}%`,
          width: mote.size,
          height: mote.size,
          borderRadius: mote.size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

interface Props {
  /** Colour of the motes — normally the content's own foreground colour. */
  color: string;
  /** Fired once the content is fully gone, so the owner can drop this state. */
  onDone: () => void;
  children: React.ReactNode;
}

export function DustDissolve({ color, onDone, children }: Props) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      const timer = setTimeout(onDone, HOLD_MS);
      return () => clearTimeout(timer);
    }

    progress.value = withDelay(
      HOLD_MS,
      withTiming(
        1,
        { duration: DISSOLVE_MS, easing: Easing.out(Easing.quad) },
        (finished) => {
          "worklet";
          if (finished) runOnJS(onDone)();
        },
      ),
    );
    // Deliberately runs once per mount: the owner unmounts this on `onDone`,
    // so there is no second life to re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15, 0.75], [1, 1, 0]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [0, 10]) },
      { translateY: interpolate(progress.value, [0, 1], [0, -6]) },
      { scale: interpolate(progress.value, [0, 1], [1, 0.97]) },
    ],
  }));

  if (reduceMotion) {
    return <>{children}</>;
  }

  return (
    <View>
      <Animated.View style={contentStyle}>{children}</Animated.View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {MOTES.map((mote, index) => (
          <DustMote
            key={index}
            mote={mote}
            progress={progress}
            color={color}
          />
        ))}
      </View>
    </View>
  );
}
