import { ChangeLogProvider } from "@/features/changelog/ChangeLogProvider";
import SideNavigation from "@/features/side-navigation/SideNavigation";
import { useTheme } from "@/hooks/useTheme";
import { Drawer } from "expo-router/drawer";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function DrawerLayout() {
  const { theme } = useTheme();

  return (
    // Above the drawer so the unread dot on the menu button, the menu row
    // and the page itself all read the same state.
    <ChangeLogProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Drawer
          drawerContent={(props) => (
            <SideNavigation drawerNavigation={props.navigation} />
          )}
          screenOptions={{
            headerShown: false,
            drawerPosition: "right",
            drawerType: "front",
            drawerStyle: {
              width: "78%",
              backgroundColor: theme.background,
            },
            overlayColor: theme.overlay,
            swipeEdgeWidth: 50,
          }}
        />
      </GestureHandlerRootView>
    </ChangeLogProvider>
  );
}
