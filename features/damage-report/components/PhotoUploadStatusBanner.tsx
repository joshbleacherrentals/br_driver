import { ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  hasPending: boolean;
  hasFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
};

export function PhotoUploadStatusBanner({
  hasPending,
  hasFailed,
  isRetrying,
  onRetry,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!hasPending && !hasFailed) return null;

  const statusColor = hasFailed ? theme.danger : theme.warning;
  const backgroundColor = statusColor + "18";
  const message = hasFailed
    ? "Some photos failed to upload. Tap Retry to try again."
    : "Photos are still uploading. Keep the app open if possible.";

  return (
    <View
      style={[styles.banner, { backgroundColor, borderColor: statusColor }]}
    >
      <View style={styles.row}>
        {hasPending && !hasFailed ? (
          <ActivityIndicator size="small" color={statusColor} />
        ) : null}
        <Text style={[styles.text, { color: statusColor, flex: 1 }]}>
          {message}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.retryBtn, isRetrying && styles.retryBtnDisabled]}
        onPress={onRetry}
        disabled={isRetrying}
        activeOpacity={0.7}
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color={theme.onAccent} />
        ) : (
          <Text style={styles.retryText}>Retry</Text>
        )}
      </TouchableOpacity>
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
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    text: {
      ...typeScale.subhead,
      fontWeight: "600",
      lineHeight: 20,
    },
    retryBtn: {
      alignSelf: "flex-start",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      minWidth: 88,
      alignItems: "center",
      backgroundColor: theme.accent,
    },
    retryBtnDisabled: {
      opacity: 0.6,
    },
    retryText: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.onAccent,
    },
  });
