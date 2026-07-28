import { type ThemeColors } from "@/constants/theme";
import { PhotoUploadStatus } from "@/hooks/db/useDamageReportPhotos";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useThemedStyles } from "@/hooks/useThemedStyles";
function statusConfig(theme: ThemeColors) {
  return {
    pending: { icon: "", color: theme.warning, spinning: true as const },
    uploaded: {
      icon: "cloud-done-outline",
      color: theme.success,
      spinning: false as const,
    },
    failed: {
      icon: "cloud-offline-outline",
      color: theme.danger,
      spinning: false as const,
    },
  } satisfies Record<
    PhotoUploadStatus,
    { icon: string; color: string; spinning: boolean }
  >;
}

export function PhotoUploadIndicator({
  status,
}: {
  status: PhotoUploadStatus;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const cfg = statusConfig(theme)[status];

  return (
    <View style={[styles.badge, { backgroundColor: cfg.color }]}>
      {cfg.spinning ? (
        <ActivityIndicator size={12} color={theme.onAccent} />
      ) : (
        <Ionicons name={cfg.icon as any} size={14} color={theme.onAccent} />
      )}
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: theme.surface,
    },
  });
}
