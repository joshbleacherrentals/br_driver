/**
 * Animated 3-state appearance switch: System · Light · Dark.
 * A sliding thumb moves under the active segment. Styled through theme tokens.
 */

import { ThemeMode } from "@/components/providers/ThemeProvider";
import { elevation, radius } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const SEG = 46;
const PAD = 3;
const H = 34;

type Option = {
  mode: ThemeMode;
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
};

const OPTIONS: Option[] = [
  { mode: "system", active: "contrast", inactive: "contrast-outline" },
  { mode: "light", active: "sunny", inactive: "sunny-outline" },
  { mode: "dark", active: "moon", inactive: "moon-outline" },
];

export default function ThemeToggle() {
  const { theme, scheme, mode, setMode } = useTheme();
  const reduceMotion = useReducedMotion();
  const index = Math.max(
    0,
    OPTIONS.findIndex((o) => o.mode === mode),
  );
  const x = useSharedValue(index * SEG);

  useEffect(() => {
    x.value = reduceMotion
      ? withTiming(index * SEG, { duration: 0 })
      : withSpring(index * SEG, { damping: 18, stiffness: 220, mass: 0.6 });
  }, [index, reduceMotion, x]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const trackBg = theme.trackFill;

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: trackBg, borderColor: theme.border },
      ]}
      accessibilityRole="tablist"
    >
      <Animated.View
        style={[
          styles.thumb,
          { backgroundColor: theme.surface, ...elevation(theme, "raised") },
          thumbStyle,
        ]}
      />
      {OPTIONS.map((o) => {
        const on = o.mode === mode;
        return (
          <Pressable
            key={o.mode}
            onPress={() => setMode(o.mode)}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.mode}
            hitSlop={4}
          >
            <Ionicons
              name={on ? o.active : o.inactive}
              size={18}
              color={on ? theme.accent : theme.textTertiary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: PAD,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    width: SEG,
    height: H,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    position: "absolute",
    top: PAD,
    left: PAD,
    width: SEG,
    height: H,
    borderRadius: radius.pill,
  },
});
