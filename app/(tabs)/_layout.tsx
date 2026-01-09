import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { useColorScheme } from "@/hooks/useColorScheme";
import { SignedIn, SignedOut } from "@clerk/clerk-expo";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <>
      <SignedIn>
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
                backgroundColor: 'rgba(16, 54, 90, 0.8)', // DARK_BLUE with transparency for blur
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
            name="test"
            options={{
              title: "Testing Powersync",
              tabBarIcon: ({ color }) => (
                <FontAwesome6 name="truck-pickup" size={24} color={color} />
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
      </SignedIn>
      <SignedOut>
        <Redirect href="/(auth)/sign-in" />
      </SignedOut>
    </>
  );
}