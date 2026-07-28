import Card from "@/components/ui/Card";
import NotificationDot from "@/components/ui/NotificationDot";
import { ThemeColors, typeScale } from "@/constants/theme";
import { useOTAUpdateContext } from "@/hooks/OTAUpdateContext";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
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
  const { updateMessage, restarting } = useOTAUpdateContext();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const shimmerX = useSharedValue(-80);
  useEffect(() => {
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(200, { duration: 900 }),
        withDelay(1200, withTiming(-80, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: "-20deg" }],
  }));

  return (
    <Card style={styles.card}>
      <NotificationDot top={-8} right={8} />
      <View style={styles.header}>
        <Ionicons
          name="cloud-download-outline"
          size={18}
          color={theme.accent}
        />
        <Text style={styles.title}>New update available!</Text>
      </View>
      {!!updateMessage && <Text style={styles.message}>{updateMessage}</Text>}
      <TouchableOpacity
        onPress={restarting ? undefined : onRestart}
        activeOpacity={restarting ? 1 : 0.8}
        style={[styles.btn, restarting && { opacity: 0.55 }]}
      >
        {!restarting && (
          <Animated.View style={[styles.shimmer, shimmerStyle]} />
        )}
        <Text style={styles.btnText}>
          {restarting ? "Restarting…" : "Restart & apply"}
        </Text>
      </TouchableOpacity>
    </Card>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
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
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    message: {
      ...typeScale.footnote,
      lineHeight: 18,
      color: theme.textSecondary,
    },
    btn: {
      alignSelf: "flex-start",
      marginTop: 4,
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 14,
      overflow: "hidden",
      backgroundColor: theme.secondaryAccent,
    },
    shimmer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 40,
      backgroundColor: theme.onSecondaryAccent + "40",
    },
    btnText: {
      ...typeScale.footnote,
      fontWeight: "700",
      color: theme.onSecondaryAccent,
    },
  });
