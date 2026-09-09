/**
 * The "Fixed" button and its banner, beside `Done` on a damage report.
 *
 * Spec: docs/specs/driver-fixed-damage-reports.md
 *
 * A confirmation stands between the tap and the write, and it is the whole
 * reason this is a component rather than three lines in the screen: the mark is
 * visible to managers and to every other driver hauling the bleacher, so a
 * fat-fingered `Fixed` on a real hazard is the failure worth designing against.
 *
 * The write itself is local and offline-safe (`setDamageReportFixed.ts`) — this
 * only decides whether it happens.
 */

import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type FixedMarkControlProps = {
  isFixed: boolean;
  /** ISO timestamp of the mark; shown in the banner. */
  fixedAt: string | null;
  /**
   * Who set the mark, when this device knows them. Offline it often does not —
   * and a missing name must cost the driver the name, not the banner.
   */
  fixedByLabel: string | null;
  onMark: () => void;
  onUnmark: () => void;
  disabled?: boolean;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
}

export function FixedMarkControl({
  isFixed,
  fixedAt,
  fixedByLabel,
  onMark,
  onUnmark,
  disabled = false,
}: FixedMarkControlProps) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const confirm = () => {
    if (isFixed) {
      Alert.alert(
        "Remove fixed mark",
        "Remove the fixed mark from this report?",
        [
          { text: "No", style: "cancel" },
          { text: "Yes", onPress: onUnmark },
        ],
      );
      return;
    }

    Alert.alert(
      "Mark as fixed",
      "Mark this damage report as fixed? Managers will still review it before it's closed.",
      [
        { text: "No", style: "cancel" },
        { text: "Yes", onPress: onMark },
      ],
    );
  };

  const when = formatWhen(fixedAt);

  return (
    <View style={styles.container}>
      {isFixed && (
        <View style={styles.banner}>
          <Ionicons name="construct-outline" size={16} color={theme.success} />
          <Text style={styles.bannerText}>
            {[
              "Fixed",
              fixedByLabel ? `by ${fixedByLabel}` : null,
              when ? `· ${when}` : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </Text>
        </View>
      )}

      <TouchableOpacity
        testID="fixed-mark-button"
        accessibilityRole="button"
        style={[styles.button, disabled && styles.buttonDisabled]}
        disabled={disabled}
        onPress={confirm}
      >
        <Text style={styles.buttonText}>
          {isFixed ? "Unmark Fixed" : "Mark as Fixed"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 8 },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.control,
      backgroundColor: theme.secondaryAccentSoft,
    },
    bannerText: {
      ...typeScale.footnote,
      color: theme.success,
      fontWeight: "600",
      flexShrink: 1,
    },
    button: {
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: radius.control,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.success,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.success,
    },
  });
}
