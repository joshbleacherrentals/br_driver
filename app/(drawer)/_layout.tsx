import SideNavigation from "@/features/side-navigation/SideNavigation";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Drawer } from "expo-router/drawer";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function DrawerLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={() => <SideNavigation />}
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
