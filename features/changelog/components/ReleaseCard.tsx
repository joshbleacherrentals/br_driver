import { ThemeColors, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ChangeLogEntry } from "../types";
import { formatReleaseDate } from "../util/formatReleaseDate";
import ChangeLogMarkdown from "./ChangeLogMarkdown";

/**
 * One release.
 *
 * The date leads and the version is a muted chip: a driver wants to know when
 * something changed, and the number here is the changelog's own line, not the
 * store version shown at the bottom of the side navigation.
 */
export default function ReleaseCard({
  entry,
  isLatest,
}: {
  entry: ChangeLogEntry;
  isLatest: boolean;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatReleaseDate(entry.date)}</Text>
        <View style={styles.badges}>
          {isLatest && (
            <View style={styles.latestChip}>
              <Text style={styles.latestChipText}>Latest</Text>
            </View>
          )}
          <Text style={styles.version}>{entry.version}</Text>
        </View>
      </View>
      <ChangeLogMarkdown body={entry.body_md} />
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 18,
      gap: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    date: {
      ...typeScale.footnote,
      fontWeight: "600",
      color: theme.textSecondary,
      flexShrink: 1,
    },
    badges: { flexDirection: "row", alignItems: "center", gap: 8 },
    latestChip: {
      backgroundColor: theme.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    latestChipText: {
      ...typeScale.caption2,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: theme.accent,
    },
    version: {
      ...typeScale.caption,
      fontWeight: "600",
      color: theme.textTertiary,
    },
  });
