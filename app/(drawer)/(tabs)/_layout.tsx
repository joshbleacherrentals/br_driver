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
import DriverGate from "@/components/widgets/DriverGate";
import { useChangeLog } from "@/features/changelog/ChangeLogProvider";
import PendingTripsList from "@/features/pending-trips/components/PendingTripsList";
import { useReleasedTripsCount } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
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
  return (
    <>
      <SignedIn>
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
  const { hasUnread: hasUnreadChangelog } = useChangeLog();
  const { theme } = useTheme();
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
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.textTertiary,
          headerShown: true,
          headerStyle: {
            height: 120,
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            borderBottomWidth: 0.5,
          },
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: "600",
            color: theme.textPrimary,
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              style={{ marginRight: 16 }}
              activeOpacity={0.7}
            >
              <View>
                <Menu size={28} color={theme.textPrimary} strokeWidth={1.75} />
                {hasUnreadChangelog && <NotificationDot />}
              </View>
            </TouchableOpacity>
          ),
          tabBarButton: AnimatedHapticTab,
          tabBarBackground: TabBarBackground,
          tabBarItemStyle: { marginTop: 10 },
          tabBarStyle: Platform.select({
            default: {
              backgroundColor: "transparent",
              borderTopColor: theme.border,
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
                  <View
                    style={[
                      badgeStyles.container,
                      { backgroundColor: theme.danger },
                    ]}
                  >
                    <Text style={[badgeStyles.text, { color: theme.onAccent }]}>
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
        <Tabs.Screen
          name="whats-new"
          options={{
            title: "What's New",
            tabBarItemStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="backlog-tickets"
          options={{
            title: "Direct Line to Developers",
            // The header's "i" button is installed by the screen itself, not
            // here: the sheet it opens is the screen's own state.
            headerTitleStyle: { fontSize: 15, fontWeight: "600" },
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
        {sheetVisible ? (
          <PendingTripsList onLeave={() => setSheetVisible(false)} />
        ) : null}
      </BottomSheetModal>
    </>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: -6,
    right: -10,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
});
