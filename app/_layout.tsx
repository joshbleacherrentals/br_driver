import SystemProvider from "@/components/providers/SystemProvider";
import { useDriver } from "@/hooks/db/useDriver";
import { useColorScheme } from "@/hooks/useColorScheme";
import { registerForPushNotificationsAsync, setupNotificationListeners } from "@/services/notificationService";
import { ClerkProvider, useUser } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useClerkSupabaseClient } from "../library/supabase/useClerkSupabaseClient";

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
  const { user, isSignedIn, isLoaded } = useUser();
  const clerk_user_id = user?.id ?? null;
  console.log('[RootLayout] Clerk User ID:', clerk_user_id);
  const router = useRouter();
  const segments = useSegments();
  const [hasWaitedForSync, setHasWaitedForSync] = useState(false);

  // Always call fetchDriver - it handles the loading states internally
  const { driver } = useDriver();

  // Give PowerSync time to sync before making routing decisions
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const timer = setTimeout(() => {
      setHasWaitedForSync(true);
    }, 1500); // Wait 1.5s for initial sync

    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn]);

  // Register push notifications - ONLY after everything is loaded
useEffect(() => {
  console.log('[Push Setup] Checking conditions:', {
    isLoaded,
    isSignedIn,
    userId: clerk_user_id,
    driver: driver === undefined ? 'undefined' : driver === null ? 'null' : 'exists',
    hasWaitedForSync
  });

  // Wait for everything to be ready
  if (!isLoaded || !isSignedIn || !clerk_user_id || driver === undefined || driver === null) {
    console.log('[Push Setup] Skipping - not ready yet');
    return;
  }

  console.log('[Push Setup] All conditions met, setting up notifications...');

  const setupPushNotifications = async () => {
    try {
      console.log('[Push Setup] Using driver user_uuid:', driver.user_uuid);
      
      // Use the user_uuid from the driver data instead of querying
      if (driver.user_uuid) {
        console.log('[Push Setup] Registering for push notifications with user_uuid:', driver.user_uuid);
        await registerForPushNotificationsAsync(driver.user_uuid);
      } else {
        console.log('[Push Setup] No user_uuid found in driver data');
      }
    } catch (error) {
      console.error('[Push Setup] Error setting up push notifications:', error);
    }
  };

  setupPushNotifications();
  
  console.log('[Push Setup] Setting up notification listeners...');
  
  // Set up listeners
  const { notificationListener, responseListener } = setupNotificationListeners();
  
  // Cleanup
  return () => {
    console.log('[Push Setup] Cleaning up notification listeners');
    notificationListener.remove();
    responseListener.remove();
  };
}, [isLoaded, isSignedIn, clerk_user_id, driver, hasWaitedForSync]);

  // Handle navigation
  useEffect(() => {
    // Wait for Clerk to load
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inNotFound = segments.includes('+not-found');

    // ✅ If not signed in, redirect to auth
    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)');
      return;
    }

    // Wait for driver data to load (undefined = still loading)
    if (driver === undefined) return;

    // ✅ Don't redirect until we've given PowerSync time to sync
    if (!hasWaitedForSync) return;

    // ✅ Redirect if driver is null (no driver exists)
    if (driver === null && !inNotFound && !inAuthGroup) {
      router.replace('/+not-found');
      return;
    }
    
    // ✅ Redirect away from not-found if driver exists
    if (driver && inNotFound) {
      router.replace('/(tabs)');
      return;
    }

    // ✅ Redirect away from auth if signed in with driver
    if (driver && inAuthGroup) {
      router.replace('/(tabs)');
      return;
    }
  }, [isLoaded, isSignedIn, clerk_user_id, driver, segments, router, hasWaitedForSync]);

  // Show loading screen - wait for Clerk first, then driver
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }}>
        <ActivityIndicator size="large" color="#10365A" />
      </View>
    );
  }

  // After Clerk loads, if signed in, wait for driver and sync
  if (isSignedIn && (driver === undefined || !hasWaitedForSync)) {
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
            <RootLayoutContent />
        </SystemProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}