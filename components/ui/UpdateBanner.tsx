import { type ThemeColors, elevation, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
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

import { useThemedStyles } from "@/hooks/useThemedStyles";
interface UpdateBannerProps {
  visible: boolean;
  onRestart: () => void;
  restarting?: boolean;
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
  restarting = false,
  message,
}: UpdateBannerProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [dismissed, setDismissed] = useState(false);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const appState = useRef(AppState.currentState);

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
  }, [visible, dismissed, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || dismissed) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top, backgroundColor: theme.header },
        animatedStyle,
      ]}
    >
      <View style={styles.textGroup}>
        <Text style={[styles.text, { color: theme.onAccent }]}>
          New version available
        </Text>
        {!!message && (
          <Text style={[styles.subText, { color: theme.onAccent + "B3" }]}>
            {message}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={restarting ? undefined : onRestart}
          style={[
            styles.updateButton,
            { backgroundColor: theme.accent },
            restarting && { opacity: 0.5 },
          ]}
        >
          <Text style={[styles.updateText, { color: theme.onAccent }]}>
            {restarting ? "Restarting…" : "Update"}
          </Text>
        </Pressable>
        <Pressable
          onPress={restarting ? undefined : () => setDismissed(true)}
          style={styles.dismissButton}
        >
          <Text style={[styles.dismissText, { color: theme.onAccent + "99" }]}>
            Later
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: "absolute",
      left: 12,
      right: 12,
      zIndex: 9999,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      ...elevation(theme, "raised"),
    },
    textGroup: {
      flex: 1,
    },
    text: {
      ...typeScale.subhead,
      fontWeight: "600",
    },
    subText: {
      ...typeScale.caption,
      marginTop: 2,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    updateButton: {
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    updateText: {
      ...typeScale.footnote,
      fontWeight: "700",
    },
    dismissButton: {
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    dismissText: {
      ...typeScale.footnote,
      fontWeight: "400",
    },
  });
}
