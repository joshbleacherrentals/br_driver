import { DARK_BLUE } from "@/constants/Colors";
import UpdateCard from "@/features/side-navigation/components/UpdateCard";
import UserProfileCard from "@/features/side-navigation/components/UserProfileCard";
import { useOTAUpdateContext } from "@/hooks/OTAUpdateContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
  {
    label: "Damage Report",
    icon: "warning-outline",
    route: "/(drawer)/(tabs)/damage-report",
  },
  {
    label: "Damage Report History",
    icon: "document-text-outline",
    route: "/(drawer)/(tabs)/damage-report-history",
  },
];

export default function SideNavigation() {
  const router = useRouter();
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const version = Constants.expoConfig?.version ?? "—";
  const { updateReady, restart } = useOTAUpdateContext();

  const handleNav = useCallback(
    (route: string) => {
      navigation.dispatch(DrawerActions.closeDrawer());
      router.push(route as any);
    },
    [navigation, router],
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" },
      ]}
    >
      <UserProfileCard />
      <View style={styles.list}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => handleNav(item.route)}
            activeOpacity={0.6}
          >
            <Ionicons
              name={item.icon as any}
              size={22}
              color={isDark ? "#EBEBF5" : DARK_BLUE}
            />
            <Text
              style={[
                styles.menuItemLabel,
                { color: isDark ? "#FFFFFF" : "#1C1C1E" },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {updateReady && <UpdateCard onRestart={restart} />}
      <Text
        style={[styles.versionText, { color: isDark ? "#636366" : "#8E8E93" }]}
      >
        Version {version}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120,120,128,0.2)",
  },
  menuItemLabel: { fontSize: 16 },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    paddingVertical: 24,
  },
});
