import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * The **local** half of submitting a damage report: writing each photo to disk
 * and recording its row, before anything is queued for upload.
 *
 * This used to cover the upload phase too. It no longer does, and the reason is
 * scope rather than taste: once photos are queued, their progress belongs to
 * every screen, not this one. `components/widgets/PhotoUploadStatusOverlay.tsx`
 * floats over the whole app and reports it there, so keeping an upload phase
 * here would mean two banners saying the same thing on the one screen where
 * both are mounted.
 *
 * What the overlay genuinely cannot report is this phase. Nothing is queued
 * yet — there are no rows for a reactive query to count — and abandoning it
 * abandons the report, which is a destructive choice tied to this screen's
 * in-flight submit and could not sensibly live in a global banner. So the
 * split is by what each one can actually know:
 *
 * - here, "saving to this device", with the destructive exit;
 * - the overlay, "uploading to the server", everywhere, with no exit needed
 *   because leaving costs nothing.
 *
 * Why a banner and not a modal: none of this needs the driver to stand still,
 * and pinning the app behind a spinner was the original complaint. Progress is
 * information, so it is styled as information — the accent family, a steady
 * bar, no pulse and no red. Red belongs to the overlay's failed state, which
 * reports photos that are genuinely lost; conflating "working normally" with
 * "something is wrong" is what makes an alarm stop meaning anything.
 */

interface Props {
  visible: boolean;
  /**
   * Photos actually written to disk. Never a loop index: the counter used to
   * advance on every photo the loop touched, so it always reached the total
   * even when nothing was saved.
   */
  current: number;
  total: number;
  /** Photos the loop has finished with but could not save. */
  failedCount?: number;
  /** Abandons the report mid-save. */
  onAbort: () => void;
}

const TITLE = "Saving photos";
const MESSAGE = "Saving your photos to this device.";
const UNIT = "saved";

export function SubmitProgressBanner({
  visible,
  current,
  total,
  failedCount = 0,
  onAbort,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!visible) return null;

  const progress = total > 0 ? Math.min(1, current / total) : 0;

  const handleAbort = () => {
    Alert.alert(
      "Cancel Damage Report?",
      "Are you sure you want to cancel this damage report? All progress will be lost.",
      [
        { text: "Keep Going", style: "cancel" },
        { text: "Cancel Report", style: "destructive", onPress: onAbort },
      ],
    );
  };

  return (
    <View
      style={styles.banner}
      accessibilityRole="progressbar"
      accessibilityLabel={`${TITLE}, ${current} of ${total} ${UNIT}`}
    >
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Ionicons name="save-outline" size={20} color={theme.onAccent} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>
            {TITLE} — {current} of {total} {UNIT}
          </Text>
          <Text style={styles.sub}>{MESSAGE}</Text>
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleAbort}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Cancel damage report"
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Silence would misrepresent the bar: with failures it stops short of
          full and nothing else would say why. */}
      {failedCount > 0 ? (
        <Text style={styles.failureNote}>
          {failedCount} photo{failedCount === 1 ? "" : "s"} could not be saved
        </Text>
      ) : null}

      <View style={styles.trackOuter}>
        <View
          style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>
    </View>
  );
}

/**
 * Shaped after `features/trips/components/ReleasedTripsBanner.tsx` — the same
 * solid-fill row, 36pt icon circle, title/subtitle block and trailing control —
 * but on `theme.accent` rather than `theme.danger`, and with no `withRepeat`
 * opacity pulse. Same family, different temperature.
 */
const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    banner: {
      // No horizontal margin of its own: unlike the trips banner, which sits at
      // the screen edge, this one is mounted inside the report's already-padded
      // scroll content and lines up with the cards below it.
      marginBottom: 16,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 8,
      backgroundColor: theme.accent,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.onAccent + "26",
    },
    textBlock: {
      flex: 1,
    },
    title: {
      ...typeScale.footnote,
      fontWeight: "700",
      color: theme.onAccent,
    },
    sub: {
      ...typeScale.caption,
      marginTop: 1,
      color: theme.onAccent + "CC",
    },
    cancelBtn: {
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 10,
      backgroundColor: theme.onAccent,
    },
    cancelBtnText: {
      ...typeScale.caption,
      fontWeight: "700",
      color: theme.accent,
    },
    failureNote: {
      ...typeScale.caption,
      color: theme.onAccent + "CC",
    },
    trackOuter: {
      width: "100%",
      height: 4,
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: theme.onAccent + "33",
    },
    trackFill: {
      height: "100%",
      borderRadius: radius.pill,
      backgroundColor: theme.onAccent,
    },
  });
