import { useThemedStyles } from "@/hooks/useThemedStyles";
import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * The two back-to-back phases of submitting a damage report, in one modal so it
 * stays up continuously instead of flashing closed between them.
 *
 * - `preparing` — writing each photo to disk and recording its row. Local, fast,
 *   and abandoning it means abandoning the report, so its exit is destructive.
 * - `uploading` — §7. The photos are safely on disk and queued; this tracks how
 *   many have actually reached the bucket. Leaving is harmless: the rows stay
 *   `pending`/`uploading` and the worker keeps going, so its exit is not a
 *   cancel at all.
 *
 * Keeping them distinct matters: a "Cancel" that discarded the report during the
 * upload phase would throw away photos that are already saved.
 */
export type SubmitProgressPhase = "preparing" | "uploading";

interface Props {
  visible: boolean;
  phase: SubmitProgressPhase;
  current: number;
  total: number;
  /** `preparing` only — abandons the report mid-save. */
  onAbort: () => void;
  /** `uploading` only — §7 "it'll finish uploading later, in the background". */
  onDismiss: () => void;
}

const COPY: Record<
  SubmitProgressPhase,
  { title: string; message: string; unit: string; action: string }
> = {
  preparing: {
    title: "Preparing Photos",
    message: "Saving your photos to this device.",
    unit: "saved",
    action: "Cancel",
  },
  uploading: {
    title: "Uploading Photos",
    message: "Keep the app open while your photos upload.",
    unit: "uploaded",
    action: "Continue in Background",
  },
};

export function SubmitProgressModal({
  visible,
  phase,
  current,
  total,
  onAbort,
  onDismiss,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const progress = total > 0 ? current / total : 0;
  const copy = COPY[phase];
  const isUploading = phase === "uploading";

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

  // §7 — the only two ways out: every photo lands (the caller stops rendering
  // the modal), or the driver explicitly chooses to leave. Nothing here stops
  // the queue; the worker carries on either way.
  const handleExit = isUploading ? onDismiss : handleAbort;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleExit}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View style={styles.card}>
          <ActivityIndicator
            size="large"
            color={theme.accent}
            style={{ marginBottom: 16 }}
          />

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.message}>{copy.message}</Text>
          <Text style={styles.counter}>
            {current} of {total} {copy.unit}
          </Text>

          <View style={styles.trackOuter}>
            <View
              style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>

          <TouchableOpacity
            style={styles.exitBtn}
            onPress={handleExit}
            activeOpacity={0.7}
          >
            <Text style={isUploading ? styles.exitTextSafe : styles.exitTextDanger}>
              {copy.action}
            </Text>
          </TouchableOpacity>

          {isUploading ? (
            <Text style={styles.footnote}>
              Photos keep uploading in the background — they are already saved on
              this device.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 28,
      width: "80%",
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    title: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 4,
    },
    message: {
      ...typeScale.footnote,
      color: theme.textSecondary,
      textAlign: "center",
      marginBottom: 8,
    },
    counter: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      marginBottom: 16,
    },
    trackOuter: {
      width: "100%",
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.separator,
      overflow: "hidden",
      marginBottom: 24,
    },
    trackFill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
    exitBtn: {
      paddingVertical: 10,
      paddingHorizontal: 32,
    },
    exitTextDanger: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.danger,
    },
    exitTextSafe: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.accent,
    },
    footnote: {
      ...typeScale.caption2,
      color: theme.textTertiary,
      textAlign: "center",
      marginTop: 8,
    },
  });
}
