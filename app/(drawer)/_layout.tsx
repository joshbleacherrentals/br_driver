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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120,120,128,0.2)",
  },
  menuItemLabel: {
    fontSize: 16,
  },
});
