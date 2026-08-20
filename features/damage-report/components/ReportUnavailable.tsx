import { radius, typeScale, type ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * §15 — what a damage-report id that resolves to nothing looks like.
 *
 * Reached when `useDamageReportById` returns no row for a route param: the
 * report does not exist, or it belongs to a different driver and the scoped
 * read correctly refused it. Both are the same fact from here — this device's
 * driver has no such report — and both used to render the normal view-only
 * screen with every field showing "—", which reads as data loss rather than as
 * a report that was never theirs.
 *
 * Deliberately does not distinguish "missing" from "someone else's": telling a
 * driver that a report exists but is not theirs would leak the existence of
 * another driver's record, which is the thing scoping is here to stop.
 */
export function ReportUnavailable({ onBack }: { onBack: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Ionicons
        name="document-outline"
        size={48}
        color={styles.icon.color as string}
      />
      <Text style={styles.title}>Report not available</Text>
      <Text style={styles.body}>
        This damage report could not be found on your account. It may have been
        removed, or it may belong to another driver.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onBack}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

export default ReportUnavailable;

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 32,
      backgroundColor: theme.background,
    },
    icon: { color: theme.textTertiary },
    title: {
      ...typeScale.title3,
      fontWeight: "600",
      color: theme.textPrimary,
      textAlign: "center",
    },
    body: {
      ...typeScale.subhead,
      color: theme.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    button: {
      marginTop: 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: radius.control,
      backgroundColor: theme.accent,
    },
    buttonText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.onAccent,
    },
  });
}
