/**
 * "Adding photos… 7 of 30" — the line that stands between accepting a large
 * selection in the OS picker and the tiles appearing.
 *
 * Copying and previewing thirty full-resolution photos takes tens of seconds.
 * Without this the screen looks untouched for that whole stretch, which reads
 * as "my pick was lost", not as "the app is working".
 *
 * A determinate count rather than a bare spinner, because the useful question
 * is not *whether* something is happening but how much longer it will take.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { PhotoImportProgress } from "../utils/pickDamagePhotos";

export function PhotoImportProgressRow({
  progress,
}: {
  progress: PhotoImportProgress;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // No total yet means the OS picker has not handed the selection over. There
  // is nothing honest to count towards, so the row says what is happening and
  // leaves the numbers out rather than inventing a denominator.
  if (progress.total === null) {
    return (
      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityLabel="Preparing photos"
      >
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.text}>Preparing photos…</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Adding photos, ${progress.done} of ${progress.total}`}
      accessibilityValue={{
        min: 0,
        max: progress.total,
        now: progress.done,
      }}
    >
      <ActivityIndicator size="small" color={theme.accent} />
      <Text style={styles.text}>
        Adding photos… {progress.done} of {progress.total}
      </Text>
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.accentSoft,
      borderRadius: radius.control,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginTop: -8,
      marginBottom: 16,
    },
    text: {
      flex: 1,
      ...typeScale.footnote,
      color: theme.textSecondary,
    },
  });
}
