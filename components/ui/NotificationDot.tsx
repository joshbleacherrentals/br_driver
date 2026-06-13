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
  if (!count || count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <View style={[styles.dot, { top, right }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    backgroundColor: "#FF3B30",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
