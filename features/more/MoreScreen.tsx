import { DARK_BLUE } from "@/constants/Colors";
import UserProfileCard from "@/features/more/components/UserProfileCard";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface MenuItem {
  label: string;
  icon: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Trip History",
    icon: "time-outline",
    route: "/(drawer)/(tabs)/trip-history",
  },
  {
    label: "My Availability",
    icon: "calendar-outline",
    route: "/(drawer)/(tabs)/driverAvailability",
  },
  {
    label: "Documents",
    icon: "document-text-outline",
    route: "/(drawer)/(tabs)/documents",
  },
  { label: "Damage Report", icon: "warning-outline", route: "/(drawer)/(tabs)/damage-report" },
  {
    label: "Damage Report History",
    icon: "document-text-outline",
    route: "/(drawer)/(tabs)/damage-report-history",
  },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <UserProfileCard />
      <View style={styles.list}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.6}
          >
            <Ionicons name={item.icon as any} size={22} color={DARK_BLUE} />
            <Text style={styles.menuItemLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
  },
  menuItemLabel: { fontSize: 16, color: "#1C1C1E" },
});
