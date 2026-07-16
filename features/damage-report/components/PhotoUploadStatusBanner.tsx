import {
  ACCENT_BLUE,
  DANGER_RED,
  WARNING_ORANGE,
} from "@/constants/Colors";
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

/**
 * Banner shown when some damage-report photos are still uploading or failed.
 */
export function PhotoUploadStatusBanner({
  hasPending,
  hasFailed,
  isRetrying,
  onRetry,
}: Props) {
  if (!hasPending && !hasFailed) return null;

  const backgroundColor = hasFailed ? "#FFF1F0" : "#FFF8EC";
  const borderColor = hasFailed ? DANGER_RED : WARNING_ORANGE;
  const message = hasFailed
    ? "Some photos failed to upload. Tap Retry to try again."
    : "Photos are still uploading. Keep the app open if possible.";

  return (
    <View style={[styles.banner, { backgroundColor, borderColor }]}>
      <View style={styles.row}>
        {hasPending && !hasFailed ? (
          <ActivityIndicator size="small" color={WARNING_ORANGE} />
        ) : null}
        <Text style={[styles.text, { color: borderColor, flex: 1 }]}>
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
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text style={styles.retryText}>Retry</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: ACCENT_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 88,
    alignItems: "center",
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
