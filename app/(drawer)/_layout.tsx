import SideNavigation from "@/features/side-navigation/SideNavigation";
import { OTAUpdateContext } from "@/hooks/OTAUpdateContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useOTAUpdate } from "@/hooks/useOTAUpdate";
import { Drawer } from "expo-router/drawer";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// ─── Dev toggle ────────────────────────────────────────────────────────────────
// Set to true to preview the OTA update UI without a real update being available.
const DEV_MOCK_OTA = __DEV__ && false;
// ───────────────────────────────────────────────────────────────────────────────

export default function DrawerLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
    </OTAUpdateContext.Provider>
  );
}
