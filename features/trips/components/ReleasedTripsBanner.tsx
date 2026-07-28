import { ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface ReleasedTripsBannerProps {
  hasReleasedTrips: boolean;
}

export default function ReleasedTripsBanner({
  hasReleasedTrips,
}: ReleasedTripsBannerProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (hasReleasedTrips) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      opacity.value = 1;
    }
  }, [hasReleasedTrips, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!hasReleasedTrips) return null;

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={() => router.navigate("/(drawer)/(tabs)/pendingTrips")}
        activeOpacity={0.85}
        style={styles.banner}
      >
        <View style={styles.left}>
          <View style={styles.iconCircle}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={theme.onAccent}
            />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title}>You have pending trips!</Text>
            <Text style={styles.sub}>Please review these right away.</Text>
          </View>
        </View>
        <View style={styles.btn}>
          <Text style={styles.btnText}>View Trips</Text>
          <Ionicons name="arrow-forward" size={13} color={theme.danger} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 2,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 10,
      backgroundColor: theme.danger,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
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
    btn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 10,
      backgroundColor: theme.onAccent,
    },
    btnText: {
      ...typeScale.caption,
      fontWeight: "700",
      color: theme.danger,
    },
  });
