import SystemProvider from "@/components/providers/SystemProvider";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ClerkProvider, useUser } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useClerkSupabaseClient } from "../library/supabase/useClerkSupabaseClient";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { useEffect, useState } from "react";
import { fetchDriver } from "@/db/fetchDrivers";
import { ActivityIndicator, View } from "react-native";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env",
  );
}

const queryClient = new QueryClient();

function RootLayoutContent() {
  useClerkSupabaseClient();
  const colorScheme = useColorScheme();
  const { isSignedIn, isLoaded } = useUser();
  const { driver } = fetchDriver();
  const router = useRouter();
  const segments = useSegments();
  const [hasWaitedForSync, setHasWaitedForSync] = useState(false);

  // Give PowerSync time to sync before making routing decisions
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const timer = setTimeout(() => {
      setHasWaitedForSync(true);
    }, 1500); // Wait 1.5s for initial sync

    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    // Wait for Clerk to load
    if (!isLoaded) return;

    // Wait for driver data to load (undefined = still loading)
    if (driver === undefined) return;

    // Don't navigate if not signed in
    if (!isSignedIn) return;

    // ✅ Don't redirect until we've given PowerSync time to sync
    if (!hasWaitedForSync) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inNotFound = segments.includes('+not-found');

    // ✅ Redirect if driver is null (no driver exists)
    if (driver === null && !inNotFound && !inAuthGroup) {
      router.replace('/+not-found');
    }
    
    // ✅ Redirect away from not-found if driver exists
    if (driver && inNotFound) {
      router.replace('/(tabs)');
    }
  }, [isLoaded, isSignedIn, driver, segments, router, hasWaitedForSync]);

  // Show loading screen while Clerk loads OR while driver is undefined (loading) OR waiting for sync
  if (!isLoaded || driver === undefined || !hasWaitedForSync) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }}>
        <ActivityIndicator size="large" color="#10365A" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <ClerkProvider
      tokenCache={tokenCache}
      __experimental_resourceCache={resourceCache}
      publishableKey={publishableKey}
    >
      <QueryClientProvider client={queryClient}>
        <SystemProvider>
          <NotificationProvider>
            <RootLayoutContent />
          </NotificationProvider>
        </SystemProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}