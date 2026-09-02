import { ChangeLogProvider } from "@/features/changelog/ChangeLogProvider";
import SideNavigation from "@/features/side-navigation/SideNavigation";
import { OTAUpdateContext } from "@/hooks/OTAUpdateContext";
import { useTheme } from "@/hooks/useTheme";
import { useOTAUpdate } from "@/hooks/useOTAUpdate";
import { Drawer } from "expo-router/drawer";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// ─── Dev toggle ────────────────────────────────────────────────────────────────
// Set to true to preview the OTA update UI without a real update being available.
const DEV_MOCK_OTA = __DEV__ && false;
// ───────────────────────────────────────────────────────────────────────────────

export default function DrawerLayout() {
  const { theme } = useTheme();
  const ota = useOTAUpdate();

  const otaValue = DEV_MOCK_OTA
    ? {
        updateReady: true,
        restarting: ota.restarting,
        updateMessage: "Performance improvements and bug fixes.",
        restart: ota.restart,
      }
    : {
        updateReady: ota.updateReady,
        restarting: ota.restarting,
        updateMessage: ota.updateMessage,
        restart: ota.restart,
      };

  return (
    <OTAUpdateContext.Provider value={otaValue}>
      {/* Above the drawer so the unread dot on the menu button, the menu row
          and the page itself all read the same state. */}
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
    </OTAUpdateContext.Provider>
  );
}
