import SystemProvider, { db } from "@/components/providers/SystemProvider";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ClerkProvider, useUser } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useClerkSupabaseClient } from "../library/supabase/useClerkSupabaseClient";

import { registerForPushNotificationsAsync, setupNotificationListeners } from "@/services/notificationService";
import { useEffect } from "react";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env",
  );
}

const queryClient = new QueryClient();

function RootLayoutContent() {
  useClerkSupabaseClient(); // Initialize Clerk-Supabase connection
  const colorScheme = useColorScheme();

  const { user, isSignedIn, isLoaded } = useUser()
  // Push notifications
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;

    const setup = async () => {
      try {
        let dbUser = null;
        for (let i = 0; i < 20; i++) {
          dbUser = await db
          .selectFrom('Users')
          .select('id')
          .where('clerk_user_id', '=', user.id)
          .executeTakeFirst();

          if (dbUser?.id) break;
          console.log(`[Push Setup] Waiting for user row... attempt ${i + 1}`);
          await new Promise(res => setTimeout(res, 500));
        }

        if (!dbUser?.id) {
          console.log('[Push Setup] User row not found in PowerSync');
          return;
        }

        await registerForPushNotificationsAsync(dbUser.id);
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
  }, [isLoaded, isSignedIn]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
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
    // Async font loading only occurs in development.
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
