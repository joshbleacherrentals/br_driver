import Card from "@/components/ui/Card";
import { BRAND_BLUE } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text } from "react-native";

const PENDING_COLOR = "#F97316";
const SAVED_RED = "#EF4444";

export default function AvailabilityIntroStrip() {
  const isDark = useColorScheme() === "dark";
  const iconColor = isDark ? "#93c5fd" : BRAND_BLUE;
  const textColor = isDark ? "#93c5fd" : BRAND_BLUE;

  return (
    <Card style={styles.card}>
      <Ionicons name="calendar-outline" size={16} color={iconColor} />
      <Text style={[styles.text, { color: textColor }]}>
        Tap a date to toggle unavailability.{" "}
        <Text style={{ color: PENDING_COLOR, fontWeight: "700" }}>Orange</Text>{" "}
        = unsaved,{" "}
        <Text style={{ color: SAVED_RED, fontWeight: "700" }}>red</Text> =
        saved.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  text: { fontSize: 13, fontWeight: "500", flex: 1 },
});
