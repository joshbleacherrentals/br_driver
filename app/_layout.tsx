import SystemProvider, { db } from "@/components/providers/SystemProvider";
import AppThemeProvider from "@/components/providers/ThemeProvider";
import AppVersionGate from "@/features/app-version/AppVersionGate";
import DriverSurveyGate from "@/features/driver-survey/DriverSurveyGate";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ClerkProvider, useUser } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useClerkSupabaseClient } from "../library/supabase/useClerkSupabaseClient";

import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
} from "@/services/notificationService";
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

  const { user, isSignedIn, isLoaded } = useUser();
  // Push notifications
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;

    // Deliberately its own `Users` lookup rather than `useDriverScope()` (§15).
    // Two reasons: push registration needs only `Users.id` and must keep
    // working for a signed-in user who has no `Drivers` row yet — the scope is
    // `null` for exactly that person — and this is an imperative poll waiting
    // for the row to arrive by sync, not a reactive read.
    const setup = async () => {
      try {
        let dbUser = null;
        for (let i = 0; i < 20; i++) {
          dbUser = await db
            .selectFrom("Users")
            .select("id")
            .where("clerk_user_id", "=", user.id)
            .executeTakeFirst();

          if (dbUser?.id) break;
          console.log(`[Push Setup] Waiting for user row... attempt ${i + 1}`);
          await new Promise((res) => setTimeout(res, 500));
        }

        if (!dbUser?.id) {
          console.log("[Push Setup] User row not found in PowerSync");
          return;
        }

        await registerForPushNotificationsAsync(dbUser.id);
      } catch (error) {
        console.error("[Push Setup] Error:", error);
      }
    };

    setup();

    const { notificationListener, responseListener } =
      setupNotificationListeners();
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
        <Stack.Screen
          name="damage-report"
          options={{
            headerShown: false,
            presentation: "card",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="damage-report-view"
          options={{
            headerShown: false,
            presentation: "card",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="edit-documents"
          options={{
            headerShown: false,
            presentation: "card",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="backlog-ticket"
          options={{
            headerShown: false,
            presentation: "card",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="bleacher-asset"
          options={{
            headerShown: false,
            presentation: "card",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="completed-trip"
          options={{
            headerShown: false,
            presentation: "card",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      {/* Status-bar content follows the app theme (not the OS), so it stays
          legible when the user overrides Light/Dark: dark text on light bg,
          light text on dark bg. */}
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      {/* Order matters: the survey mounts first so a forced update modal,
          mounted after it, renders on top. `shouldAskSurvey` already yields to
          a force block — this is the belt to that pair of braces. */}
      <DriverSurveyGate />
      <AppVersionGate />
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
    <AppThemeProvider>
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
    </AppThemeProvider>
  );
}
