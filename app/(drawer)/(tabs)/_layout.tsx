import { Redirect, Tabs } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import NotificationDot from "@/components/ui/NotificationDot";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { UpdateBanner } from "@/components/ui/UpdateBanner";
import DriverGate from "@/components/widgets/DriverGate";
import { BRAND_BLUE } from "@/constants/Colors";
import PendingTripsList from "@/features/pending-trips/components/PendingTripsList";
import { useReleasedTripsCount } from "@/hooks/db/useWorkTrackers";
import { useOTAUpdateContext } from "@/hooks/OTAUpdateContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { SignedIn, SignedOut } from "@clerk/clerk-expo";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { ClipboardClock, Menu, Navigation2 } from "lucide-react-native";
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

export default function TabLayout() {
  const { updateReady, restart, updateMessage, restarting } =
    useOTAUpdateContext();

  return (
    <>
      <SignedIn>
        <UpdateBanner
          visible={updateReady}
          onRestart={restart}
          restarting={restarting}
          message={updateMessage}
        />
        <DriverGate>
          <TabsContent />
        </DriverGate>
      </SignedIn>
      <SignedOut>
        <Redirect href="/(auth)/sign-in" />
      </SignedOut>
    </>
  );
}

/**
 * The signed-in, synced driver experience. Rendered only once DriverGate
 * resolves to "ready", so its PowerSync hooks and list state never mount while
 * the app is still gating.
 */
function TabsContent() {
  const { updateReady } = useOTAUpdateContext();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const navigation = useNavigation<any>();
  const { count: pendingCount } = useReleasedTripsCount();

  const shownRef = useRef(false);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Auto-show bottom sheet once per session when pending trips exist
  useEffect(() => {
    if (pendingCount > 0 && !shownRef.current) {
      shownRef.current = true;
      const timer = setTimeout(() => setSheetVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, [pendingCount]);

  return (
    <>
      <Tabs
        screenOptions={{
          animation: "none",
          tabBarShowLabel: false,
          tabBarActiveTintColor: BRAND_BLUE,
          tabBarInactiveTintColor: isDark ? "#636366" : "#8E8E93",
          headerShown: true,
          headerStyle: {
            height: 120,
            backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
            borderBottomColor: isDark ? "#38383A" : "#E5E7EB",
            borderBottomWidth: 0.5,
          },
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: "600",
            color: isDark ? "#FFFFFF" : "#111827",
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              style={{ marginRight: 16 }}
              activeOpacity={0.7}
            >
              <View>
                <Menu
                  size={28}
                  color={isDark ? "#FFFFFF" : "#111827"}
                  strokeWidth={1.75}
                />
                {updateReady && <NotificationDot />}
              </View>
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
                <ClipboardClock size={28} color={color} strokeWidth={1.75} />
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
        {/*
          Rare / heavy screens: wrapped with withUnmountOnBlur in their
          route files so PowerSync hooks and list state release RAM.
          Trips + Pending stay mounted (primary workflow).
        */}
        <Tabs.Screen
          name="driverAvailability"
          options={{
            title: "My Availability",
            tabBarItemStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="documents"
          options={{
            title: "Documents",
            tabBarItemStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarItemStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="trip-history"
          options={{
            title: "Trip History",
            tabBarItemStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="damage-report-history"
          options={{
            title: "Damage Reports",
            tabBarItemStyle: { display: "none" },
          }}
        />
      </Tabs>

      {/* Auto-open pending trips sheet on launch */}
      <BottomSheetModal
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      >
        {/* Mount list only while sheet is open — avoids permanent RAM cost */}
        {sheetVisible ? <PendingTripsList /> : null}
      </BottomSheetModal>
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
