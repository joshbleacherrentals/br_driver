/**
 * `All` / `Mine` on the Damage Reports screen.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * The screen used to be a driver's own history. `All` is what turns it into
 * the place where "is this already reported?" gets answered — so it leads, and
 * `Mine` keeps the old purpose beside it.
 */

import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type DamageReportTab = "all" | "mine";

export default function DamageReportTabs({
  value,
  onChange,
}: {
  value: DamageReportTab;
  onChange: (tab: DamageReportTab) => void;
}) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={styles.row}>
      {(
        [
          ["all", "All"],
          ["mine", "Created by me"],
        ] as const
      ).map(([tab, label]) => (
        <TouchableOpacity
          key={tab}
          testID={`damage-tab-${tab}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab }}
          style={[styles.tab, value === tab && styles.tabActive]}
          onPress={() => onChange(tab)}
        >
          <Text style={[styles.label, value === tab && styles.labelActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: 8,
      padding: 4,
      borderRadius: radius.pill,
      backgroundColor: theme.secondaryAccentSoft,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: radius.pill,
      alignItems: "center",
    },
    tabActive: { backgroundColor: theme.surface },
    label: { ...typeScale.footnote, fontWeight: "600", color: theme.textSecondary },
    labelActive: { color: theme.header },
  });
}
