import { Redirect, Tabs } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import BottomSheetModal from "@/components/ui/BottomSheetModal";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { UpdateBanner } from "@/components/ui/UpdateBanner";
import LoadingScreen from "@/components/widgets/loadingScreen";
import NoDriverScreen from "@/components/widgets/no-driver";
import PendingTripsList from "@/components/widgets/PendingTripsList";
import { useCheckDriver } from "@/hooks/db/useCheckActiveDriver";
import { useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useOTAUpdate } from "@/hooks/useOTAUpdate";
import { SignedIn, SignedOut } from "@clerk/clerk-expo";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import {
  CalendarDays,
  CircleUser,
  ClipboardClock,
  FileText,
  Menu,
  Navigation2,
} from "lucide-react-native";

// ── Animated tab bar button ─────────────────────────────────────────────────
function AnimatedHapticTab(props: any) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      {...props}
      onPressIn={(ev: any) => {
        scale.value = 0.92;
        scale.value = withSpring(1, { damping: 50, stiffness: 2000 });
        props.onPressIn?.(ev);
      }}
    >
      <Animated.View style={[animatedStyle, { alignItems: "center" }]}>
        {props.children}
      </Animated.View>
    </Pressable>
  );
}

const BRAND_BLUE = "#1D62A3";

export default function TabLayout() {
  const { driverProfile, isLoading } = useCheckDriver();
  const { updateReady, restart } = useOTAUpdate();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const navigation = useNavigation<any>();
  const { workTrackers } = useWorkTrackers();

  const shownRef = useRef(false);
  const [sheetVisible, setSheetVisible] = useState(false);

  const pendingCount = useMemo(
    () => (workTrackers ?? []).filter((wt) => wt.status === "released").length,
    [workTrackers],
  );

  // Auto-show bottom sheet once per session when pending trips exist
  useEffect(() => {
    if (
      pendingCount > 0 &&
      !shownRef.current &&
      !isLoading &&
      driverProfile !== false
    ) {
      shownRef.current = true;
      const timer = setTimeout(() => setSheetVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, [pendingCount, isLoading, driverProfile]);

  return (
    <>
      <SignedIn>
        <UpdateBanner visible={true} onRestart={restart} />
        {isLoading ? (
          <LoadingScreen />
        ) : driverProfile === false ? (
          <NoDriverScreen />
        ) : (
          <>
            <Tabs
              screenOptions={{
                animation: "shift",
                tabBarShowLabel: false,
                tabBarActiveTintColor: BRAND_BLUE,
                tabBarInactiveTintColor: isDark ? "#636366" : "#8E8E93",
                headerShown: true,
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() =>
                      navigation.dispatch(DrawerActions.openDrawer())
                    }
                    style={{ marginRight: 16 }}
                    activeOpacity={0.7}
                  >
                    <Menu
                      size={24}
                      color={isDark ? "#FFFFFF" : "#111827"}
                      strokeWidth={1.75}
                    />
                  </TouchableOpacity>
                ),
                tabBarButton: AnimatedHapticTab,
                tabBarBackground: TabBarBackground,
                tabBarItemStyle: { marginTop: 10 },
                tabBarStyle: Platform.select({
                  default: {
                    backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                    borderTopColor: isDark ? "#38383A" : "#E5E7EB",
                    borderTopWidth: 0.5,
                    height: 92,
                  },
                }),
              }}
            >
              <Tabs.Screen
                name="index"
                options={{
                  title: "Trips",
                  tabBarIcon: ({ color }) => (
                    <Navigation2 size={28} color={color} strokeWidth={1.75} />
                  ),
                }}
              />
              <Tabs.Screen
                name="pendingTrips"
                options={{
                  title: "Pending",
                  tabBarIcon: ({ color }) => (
                    <View>
                      <ClipboardClock
                        size={28}
                        color={color}
                        strokeWidth={1.75}
                      />
                      {pendingCount > 0 && (
                        <View style={badgeStyles.container}>
                          <Text style={badgeStyles.text}>
                            {pendingCount > 99 ? "99+" : pendingCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  ),
                }}
              />
              <Tabs.Screen
                name="driverAvailability"
                options={{
                  title: "My Availability",
                  tabBarIcon: ({ color }) => (
                    <CalendarDays size={28} color={color} strokeWidth={1.75} />
                  ),
                }}
              />
              <Tabs.Screen
                name="documents"
                options={{
                  title: "Documents",
                  tabBarIcon: ({ color }) => (
                    <FileText size={28} color={color} strokeWidth={1.75} />
                  ),
                }}
              />
              <Tabs.Screen
                name="profile"
                options={{
                  title: "Profile",
                  tabBarIcon: ({ color }) => (
                    <CircleUser size={28} color={color} strokeWidth={1.75} />
                  ),
                }}
              />
              <Tabs.Screen
                name="more"
                options={{
                  tabBarItemStyle: { display: "none" },
                  headerShown: false,
                }}
              />
            </Tabs>

            {/* Auto-open pending trips sheet on launch */}
            <BottomSheetModal
              visible={sheetVisible}
              onClose={() => setSheetVisible(false)}
            >
              <PendingTripsList />
            </BottomSheetModal>
          </>
        )}
      </SignedIn>
      <SignedOut>
        <Redirect href="/(auth)/sign-in" />
      </SignedOut>
    </>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
