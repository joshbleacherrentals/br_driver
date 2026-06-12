import { DARK_BLUE } from "@/constants/Colors";
import UserProfileCard from "@/features/more/components/UserProfileCard";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Drawer } from "expo-router/drawer";
import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

interface DrawerMenuItem {
  label: string;
  icon: string;
  route: string;
}

const DRAWER_ITEMS: DrawerMenuItem[] = [
  { label: "Trip History", icon: "time-outline", route: "/trip-history" },
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
  { label: "Damage Report", icon: "warning-outline", route: "/damage-report" },
  {
    label: "Damage Report History",
    icon: "document-text-outline",
    route: "/damage-report-history",
  },
];

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const handleNav = useCallback(
    (route: string) => {
      props.navigation.closeDrawer();
      router.push(route as any);
    },
    [props.navigation, router],
  );

  return (
    <View
      style={[
        styles.drawerContainer,
        { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" },
      ]}
    >
      <UserProfileCard />

      <View style={styles.list}>
        {DRAWER_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[
              styles.menuItem,
              { backgroundColor: isDark ? "#2C2C2E" : "#FFFFFF" },
            ]}
            onPress={() => handleNav(item.route)}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon as any} size={22} color="#FFFFFF" />
              </View>
              <Text
                style={[
                  styles.menuItemLabel,
                  { color: isDark ? "#FFFFFF" : "#1C1C1E" },
                ]}
              >
                {item.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerPosition: "right",
          drawerType: "front",
          drawerStyle: {
            width: "78%",
            backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7",
          },
          overlayColor: "rgba(0,0,0,0.4)",
          swipeEdgeWidth: 50,
        }}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: DARK_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
});
