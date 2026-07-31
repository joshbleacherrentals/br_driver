/**
 * Badge — themed status pill. Replaces the per-screen status/pill markup.
 *
 * Variants:
 *  • "soft"  (default) — tinted fill (color @ 12%), colored text. Optional
 *                        leading `icon` or `dot`.
 *  • "solid"          — filled with `color`, `onAccent` text. For headline
 *                        statuses (PENDING ACCEPTANCE, ACCEPTED…).
 */

import { radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

export type BadgeVariant = "soft" | "solid";

export interface BadgeProps {
  label: string;
  /** Semantic color from the theme (e.g. `theme.success`). Drives fill + text. */
  color: string;
  variant?: BadgeVariant;
  /** Leading Ionicon. Takes precedence over `dot`. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Leading dot indicator. */
  dot?: boolean;
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 12% alpha suffix for soft fills built from a 6-digit hex color. */
const SOFT_ALPHA = "1F";

function softFill(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + SOFT_ALPHA : color;
}

export default function Badge({
  label,
  color,
  variant = "soft",
  icon,
  dot,
  uppercase = false,
  style,
}: BadgeProps) {
  const { theme } = useTheme();
  const solid = variant === "solid";
  const fg = solid ? theme.onAccent : color;

  return (
    <View
      style={[
        styles.base,
        solid ? styles.solid : styles.soft,
        { backgroundColor: solid ? color : softFill(color) },
        style,
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={13} color={fg} />
      ) : dot ? (
        <View style={[styles.dot, { backgroundColor: fg }]} />
      ) : null}
      <Text
        style={[
          styles.label,
          {
            color: fg,
            fontWeight: solid ? "700" : "600",
            letterSpacing: uppercase ? 0.5 : 0,
            textTransform: uppercase ? "uppercase" : "none",
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  soft: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  solid: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.control },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...typeScale.caption2 },
});
