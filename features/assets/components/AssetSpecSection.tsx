/**
 * A titled card of label/value pairs — the whole vocabulary of the detail
 * screen. A spec sheet is a list of facts, and every fact reads the same way.
 *
 * Takes its rows as data rather than as children so the card can draw hairlines
 * *between* rows and not under the last one. Separator-as-child-border always
 * leaves one stray line at the bottom of the card, and there is no last-child
 * selector to take it away with.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type AssetSpec = {
  label: string;
  value: string;
  /** Renders the value in the accent colour — for the one headline fact. */
  emphasis?: boolean;
};

export default function AssetSpecSection({
  title,
  specs,
}: {
  title: string;
  specs: AssetSpec[];
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {specs.map((spec, index) => (
          <View
            key={spec.label}
            style={[styles.row, index > 0 && styles.rowDivided]}
          >
            <Text style={styles.label}>{spec.label}</Text>
            {/* A VIN is seventeen characters and has to be readable in full
                (and copyable), so values wrap rather than truncate. */}
            <Text
              style={[styles.value, spec.emphasis && styles.valueEmphasis]}
              selectable
            >
              {spec.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    section: { gap: 8 },
    sectionTitle: {
      ...typeScale.caption2,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: theme.textTertiary,
      paddingHorizontal: 4,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 14,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      paddingVertical: 11,
    },
    rowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.separator,
    },
    label: { ...typeScale.subhead, color: theme.textSecondary, flexShrink: 0 },
    value: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
      flex: 1,
      textAlign: "right",
    },
    valueEmphasis: { color: theme.accent },
  });
