import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable } from "react-native";
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
import {
  CalendarDays,
  CircleUser,
  Ellipsis,
  FileText,
  Truck,
} from "lucide-react-native";

// Animate on press instead of on focus — avoids remount issues
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

import LoadingScreen from "@/components/widgets/loadingScreen";
import NoDriverScreen from "@/components/widgets/no-driver";
import { useCheckDriver } from "@/hooks/db/useCheckActiveDriver";

const BRAND_BLUE = "#1D62A3";

export default function TabLayout() {
  const { driverProfile, isLoading } = useCheckDriver();
  const { updateReady, restart } = useOTAUpdate();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

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
              tabBarActiveTintColor: BRAND_BLUE,
              tabBarInactiveTintColor: isDark ? "#636366" : "#8E8E93",
              headerShown: false,
              tabBarButton: AnimatedHapticTab,
              tabBarBackground: TabBarBackground,
              tabBarStyle: Platform.select({
                ios: {
                  position: "absolute",
                  backgroundColor: "transparent",
                },
                default: {
                  backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                  borderTopColor: isDark ? "#38383A" : "#E5E7EB",
                  borderTopWidth: 0.5,
                },
              }),
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: "Trips",
                tabBarIcon: ({ color }) => (
                  <Truck size={22} color={color} strokeWidth={1.75} />
                ),
              }}
            />
            <Tabs.Screen
              name="driverAvailability"
              options={{
                title: "Calendar",
                tabBarIcon: ({ color }) => (
                  <CalendarDays size={22} color={color} strokeWidth={1.75} />
                ),
              }}
            />
            <Tabs.Screen
              name="documents"
              options={{
                title: "Documents",
                tabBarIcon: ({ color }) => (
                  <FileText size={22} color={color} strokeWidth={1.75} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: "Profile",
                tabBarIcon: ({ color }) => (
                  <CircleUser size={22} color={color} strokeWidth={1.75} />
                ),
              }}
            />
            <Tabs.Screen
              name="more"
              options={{
                title: "More",
                tabBarIcon: ({ color }) => (
                  <Ellipsis size={22} color={color} strokeWidth={1.75} />
                ),
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
