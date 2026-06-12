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
  }, [hasReleasedTrips]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!hasReleasedTrips) return null;

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={() => router.push("/(drawer)/(tabs)/pendingTrips")}
        activeOpacity={0.85}
        style={styles.banner}
      >
        <View style={styles.left}>
          <Ionicons name="alert-circle" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>You have pending trips!</Text>
            <Text style={styles.sub}>Please review these right away.</Text>
          </View>
        </View>
        <View style={styles.btn}>
          <Text style={styles.btnText}>View Trips</Text>
          <Ionicons name="arrow-forward" size={13} color="#FF9500" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#C0392B",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  sub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 1,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  btnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FF9500",
  },
});
