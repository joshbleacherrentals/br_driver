import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { useColorScheme } from "@/hooks/useColorScheme";
import { SignedIn, SignedOut } from "@clerk/clerk-expo";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

import LoadingScreen from "@/components/widgets/loadingScreen";
import NoDriverScreen from "@/components/widgets/no-driver";
import { useCheckDriver } from "@/hooks/db/useCheckActiveDriver";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { driverProfile, isLoading } = useCheckDriver();

  return (
    <>
      <SignedIn>
        {isLoading ? (
          <LoadingScreen />
        ) : driverProfile === false ? (
          <NoDriverScreen />
        ) : (
          <Tabs
            screenOptions={{
              tabBarActiveTintColor: LIGHT_BLUE,
              tabBarInactiveTintColor: "#8E8E93",
              headerShown: false,
              tabBarButton: HapticTab,
              tabBarBackground: TabBarBackground,
              tabBarStyle: Platform.select({
                ios: {
                  position: "absolute",
                  backgroundColor: "rgba(16, 54, 90, 0.8)", // DARK_BLUE with transparency for blur
                },
                default: {
                  backgroundColor: DARK_BLUE,
                },
              }),
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: "Trips",
                tabBarIcon: ({ color }) => (
                  <FontAwesome6 name="truck-pickup" size={24} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="driverAvailability"
              options={{
                title: "Calendar",
                tabBarIcon: ({ color }) => (
                  <FontAwesome6 name="calendar-days" size={24} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="documents"
              options={{
                title: "Documents",
                tabBarIcon: ({ color }) => (
                  <FontAwesome6 name="book" size={24} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: "Profile",
                tabBarIcon: ({ color }) => (
                  <FontAwesome6 name="user-circle" size={24} color={color} />
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
