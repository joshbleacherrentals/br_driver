import Card from "@/components/ui/Card";
import NotificationDot from "@/components/ui/NotificationDot";
import { BRAND_BLUE, GREEN_ACCENT } from "@/constants/Colors";
import { useOTAUpdateContext } from "@/hooks/OTAUpdateContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface UpdateCardProps {
  onRestart: () => void;
}

export default function UpdateCard({ onRestart }: UpdateCardProps) {
  const { updateMessage } = useOTAUpdateContext();
  const isDark = useColorScheme() === "dark";

  const shimmerX = useSharedValue(-80);
  useEffect(() => {
    // Sweep across, then pause before repeating
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(200, { duration: 900 }),
        withDelay(1200, withTiming(-80, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: "-20deg" }],
  }));

  return (
    <Card
      style={[
        styles.card,
        // {
        //   borderColor: isDark
        //     ? "rgba(10,132,255,0.35)"
        //     : "rgba(10,132,255,0.3)",
        // },
      ]}
    >
      <NotificationDot top={-8} right={8} />
      <View style={styles.header}>
        <Ionicons name="cloud-download-outline" size={18} color={BRAND_BLUE} />
        <Text style={[styles.title, { color: isDark ? "#FFFFFF" : "#111827" }]}>
          New update available!
        </Text>
      </View>
      {!!updateMessage && (
        <Text
          style={[
            styles.message,
            { color: isDark ? "rgba(255,255,255,0.6)" : "#6B7280" },
          ]}
        >
          {updateMessage}
        </Text>
      )}
      <TouchableOpacity
        onPress={onRestart}
        activeOpacity={0.8}
        style={styles.btn}
      >
        <Animated.View style={[styles.shimmer, shimmerStyle]} />
        <Text style={styles.btnText}>Restart &amp; apply</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  btn: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: GREEN_ACCENT,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
