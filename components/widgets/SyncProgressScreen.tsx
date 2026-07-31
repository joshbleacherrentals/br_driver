import { useThemedStyles } from "@/hooks/useThemedStyles";
import { type ThemeColors } from "@/constants/theme";
import { getAuthStyles } from "@/constants/AuthStyles";
import { useInitialSyncStatus } from "@/hooks/db/useInitialSyncStatus";
import { useTheme } from "@/hooks/useTheme";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * First-sync loading screen with a real progress bar driven by PowerSync's
 * download progress. While downloading it shows determinate progress; before
 * the download starts (connecting / applying) it falls back to a spinner.
 */
export default function SyncProgressScreen() {
  const { theme, scheme } = useTheme();
  const styles = getAuthStyles(scheme);
  const local = useThemedStyles(makeStyles);
  const { progress } = useInitialSyncStatus();

  const width = useSharedValue(0);
  // Once we've seen progress, keep the bar visible (don't flash back to the
  // spinner when downloadProgress briefly clears at the end).
  const [everDownloaded, setEverDownloaded] = useState(false);

  useEffect(() => {
    if (progress != null) {
      setEverDownloaded(true);
      width.value = withTiming(Math.max(0, Math.min(1, progress)), {
        duration: 300,
      });
    }
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const determinate = progress != null || everDownloaded;
  const pct =
    progress != null ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : 100;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={local.container}>
        <Image
          source={require("@/assets/images/NEW-Bleacher-Rentals-logo.png")}
          style={local.logo}
          contentFit="contain"
          accessibilityLabel="Bleacher Rentals"
        />

        {determinate ? (
          <>
            <View style={local.track}>
              <Animated.View style={[local.fill, fillStyle]} />
            </View>
            <Text style={styles.subtitle}>Syncing your data… {pct}%</Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.subtitle, { marginTop: 16 }]}>Connecting…</Text>
          </>
        )}
      </View>
    </>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    logo: {
      width: 200,
      height: 60,
      marginBottom: 40,
    },
    track: {
      width: "100%",
      maxWidth: 320,
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      backgroundColor: theme.trackFill,
      marginBottom: 16,
    },
    fill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
  });
}
