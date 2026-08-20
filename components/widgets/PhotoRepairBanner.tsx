import { ThemeColors, typeScale } from "@/constants/theme";
import type { PhotoRepairController } from "@/hooks/usePhotoRepair";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  repair: PhotoRepairController;
  /** Noun for the copy, e.g. "report" or "inspection". */
  subject: string;
  /**
   * False when the parent no longer accepts edits (resolved report, closed
   * trip). The banner still explains the problem — hiding it would leave the
   * driver believing photos are stored that are not — it just stops offering a
   * fix the record can no longer take.
   */
  editable: boolean;
};

/**
 * Shown once a direct bucket check confirmed photos are genuinely missing.
 *
 * This is the stronger, terminal statement of the upload-status banner: not
 * "still trying" but "these are not on the server, and this phone no longer has
 * what it needs to finish". Retry appears only while something still has a local
 * file to send; otherwise a replacement photo is the only remaining fix.
 */
export function PhotoRepairBanner({ repair, subject, editable }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (repair.replaceableCount === 0) return null;

  const count = repair.replaceableCount;
  const noun = `${count} photo${count === 1 ? "" : "s"}`;

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Ionicons name="cloud-offline" size={18} color={theme.danger} />
        <Text style={styles.text}>
          {noun} {count === 1 ? "was" : "were"} never stored on the server.
          {editable
            ? ` Add ${count === 1 ? "a replacement" : "replacements"} to keep this ${subject} complete.`
            : ` This ${subject} is closed, so ${count === 1 ? "it" : "they"} can no longer be replaced here.`}
        </Text>
      </View>

      {repair.canRetry || repair.canReplace ? (
        <View style={styles.actions}>
          {repair.canRetry ? (
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => void repair.retry()}
              disabled={repair.isBusy}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </TouchableOpacity>
          ) : null}

          {repair.canReplace ? (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={() => void repair.replace()}
              disabled={repair.isBusy}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              {repair.isBusy ? (
                <ActivityIndicator size="small" color={theme.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {count === 1 ? "Choose Photo" : "Choose Photos"}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    banner: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      gap: 10,
      backgroundColor: theme.danger + "18",
      borderColor: theme.danger,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    text: {
      ...typeScale.subhead,
      fontWeight: "600",
      lineHeight: 20,
      flex: 1,
      color: theme.danger,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
    },
    button: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      minWidth: 88,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.danger,
    },
    secondaryButtonText: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.danger,
    },
    primaryButton: {
      backgroundColor: theme.accent,
    },
    primaryButtonText: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.onAccent,
    },
  });
