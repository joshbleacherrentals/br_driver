import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface UpdateBannerProps {
  visible: boolean;
  onRestart: () => void;
}

/**
 * Non-blocking banner shown at the top of the screen when an OTA update
 * has been downloaded and is ready to apply. The driver can tap "Update"
 * to restart or dismiss it and keep working.
 */
export function UpdateBanner({ visible, onRestart }: UpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const insets = useSafeAreaInsets();

  if (!visible || dismissed) return null;

  return (
    <View style={[styles.container, { top: insets.top }]}>
      <Text style={styles.text}>New version available</Text>
      <View style={styles.actions}>
        <Pressable onPress={onRestart} style={styles.updateButton}>
          <Text style={styles.updateText}>Update</Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} style={styles.dismissButton}>
          <Text style={styles.dismissText}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#10365A",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  updateButton: {
    backgroundColor: "#1D62A3",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  updateText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  dismissButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  dismissText: {
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: "500",
  },
});
