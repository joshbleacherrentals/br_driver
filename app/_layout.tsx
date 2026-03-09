import SystemProvider from "@/components/providers/SystemProvider";
import { useCheckDriver } from "@/hooks/db/useCheckDriver";
import { useColorScheme } from "@/hooks/useColorScheme";
import { registerForPushNotificationsAsync, setupNotificationListeners } from "@/services/notificationService";
import { ClerkProvider, useUser } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { useStatus } from "@powersync/react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useClerkSupabaseClient } from "../library/supabase/useClerkSupabaseClient";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
if (!publishableKey) {
  throw new Error("Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env");
}

const queryClient = new QueryClient();

function RootLayoutContent() {
  useClerkSupabaseClient();

  const colorScheme = useColorScheme();
  const { user, isSignedIn, isLoaded } = useUser();
  const clerk_user_id = user?.id ?? null;
  const router = useRouter();
  const segments = useSegments();
  const powerSyncStatus = useStatus();
  const hasSynced = powerSyncStatus.hasSynced ?? false;

  const { driverProfile, isLoading: driverLoading } = useCheckDriver();

  // Push notifications
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerk_user_id || driverProfile !== true) return;

    const setup = async () => {
      try {
        if (user?.id) await registerForPushNotificationsAsync(user.id);
      } catch (error) {
        console.error('[Push Setup] Error:', error);
      }
    };

    setup();

    const { notificationListener, responseListener } = setupNotificationListeners();
    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, [isLoaded, isSignedIn, clerk_user_id, driverProfile]);

  // Navigation
  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inLoading = segments.includes('loading');
    const inNoDriver = segments.includes('no-driver');

    if (!isSignedIn) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    // Wait for PowerSync AND driver query to both be ready
    if (!hasSynced || driverProfile === undefined || driverLoading) {
      if (!inLoading) router.replace('/loading');
      return;
    }

    if (driverProfile === false && !inNoDriver) {
      router.replace('/no-driver');
      return;
    }

    if (driverProfile === true && (inAuthGroup || inLoading || inNoDriver)) {
      router.replace('/(tabs)');
      return;
    }
  }, [isLoaded, isSignedIn, driverProfile, driverLoading, segments, hasSynced]);


  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="loading" options={{ headerShown: false }} />
        <Stack.Screen name="no-driver" options={{ headerShown: false }} />
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

  if (!loaded) return null;

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