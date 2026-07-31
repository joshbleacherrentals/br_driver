import { ThemeColors, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface NotificationDotProps {
  /** Number to display. Capped at 99+. Pass 0 or omit to hide. */
  count?: number;
  /** Position offset from the top-right corner of the parent. Defaults work for most icons. */
  top?: number;
  right?: number;
}

/**
 * A red notification badge that floats over the top-right corner of its parent.
 * Wrap the parent in a `<View>` with no overflow clipping so this can bleed out.
 */
export default function NotificationDot({
  count = 1,
  top = -5,
  right = -5,
}: NotificationDotProps) {
  const styles = useThemedStyles(makeStyles);

  if (!count || count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <View style={[styles.dot, { top, right }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    dot: {
      position: "absolute",
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      backgroundColor: theme.danger,
    },
    text: {
      ...typeScale.caption2,
      fontWeight: "700",
      color: theme.onAccent,
    },
  });
