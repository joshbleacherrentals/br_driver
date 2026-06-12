import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import TabBarBackground from "@/components/ui/TabBarBackground";
import { UpdateBanner } from "@/components/ui/UpdateBanner";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useOTAUpdate } from "@/hooks/useOTAUpdate";
import { SignedIn, SignedOut } from "@clerk/clerk-expo";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import {
  CalendarDays,
  CircleUser,
  FileText,
  Menu,
  Navigation2,
} from "lucide-react-native";

import LoadingScreen from "@/components/widgets/loadingScreen";
import NoDriverScreen from "@/components/widgets/no-driver";
import { useCheckDriver } from "@/hooks/db/useCheckActiveDriver";

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

  return (
    <>
      <SignedIn>
        <UpdateBanner visible={updateReady} onRestart={restart} />
        {isLoading ? (
          <LoadingScreen />
        ) : driverProfile === false ? (
          <NoDriverScreen />
        ) : (
          <Tabs
            screenOptions={{
              animation: "fade",
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
        )}
      </SignedIn>
      <SignedOut>
        <Redirect href="/(auth)/sign-in" />
      </SignedOut>
    </>
  );
}
