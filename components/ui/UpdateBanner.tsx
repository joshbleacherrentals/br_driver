import { BRAND_BLUE, DARK_BLUE } from "@/constants/Colors";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface UpdateBannerProps {
  visible: boolean;
  onRestart: () => void;
  message?: string;
}

/**
 * Non-blocking banner shown at the top of the screen when an OTA update
 * has been downloaded and is ready to apply. The driver can tap "Update"
 * to restart or dismiss it and keep working.
 */
export function UpdateBanner({
  visible,
  onRestart,
  message,
}: UpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const appState = useRef(AppState.currentState);

  // Re-show the banner whenever the app comes back to the foreground
  // so "Later" means "not right now" rather than "never this session".
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        setDismissed(false);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!visible || dismissed) return;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 400 }),
        withTiming(0, { duration: 400 }),
      ),
      -1,
    );
    return () => {
      translateY.value = 0;
    };
  }, [visible, dismissed]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || dismissed) return null;

  return (
    <Animated.View
      style={[styles.container, { top: insets.top }, animatedStyle]}
    >
      <View style={styles.textGroup}>
        <Text style={styles.text}>New version available</Text>
        {!!message && <Text style={styles.subText}>{message}</Text>}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onRestart} style={styles.updateButton}>
          <Text style={styles.updateText}>Update</Text>
        </Pressable>
        <Pressable
          onPress={() => setDismissed(true)}
          style={styles.dismissButton}
        >
          <Text style={styles.dismissText}>Later</Text>
        </Pressable>
      </View>
    </Animated.View>
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
    backgroundColor: DARK_BLUE,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  textGroup: {
    flex: 1,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  subText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  updateButton: {
    backgroundColor: BRAND_BLUE,
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
