import { PhotoUploadStatus } from "@/hooks/db/useDamageReportPhotos";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

const STATUS_CONFIG: Record<
  PhotoUploadStatus,
  { icon: string; color: string; spinning?: boolean }
> = {
  pending: { icon: "", color: "#FF9500", spinning: true },
  uploaded: { icon: "cloud-done-outline", color: "#34C759" },
};

export function PhotoUploadIndicator({
  status,
}: {
  status: PhotoUploadStatus;
}) {
  const cfg = STATUS_CONFIG[status];

  return (
    <View style={[styles.badge, { backgroundColor: cfg.color }]}>
      {cfg.spinning ? (
        <ActivityIndicator size={12} color="#FFF" />
      ) : (
        <Ionicons name={cfg.icon as any} size={14} color="#FFF" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: "#FFF",
  },
});
