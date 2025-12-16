// app/_layout.tsx
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { TripModeGate } from "@/components/TripModeGate";
import { useColorScheme } from "@/hooks/useColorScheme";
import { RootErrorBoundary } from "@/utils/RootErrorBoundary";
import "@/utils/supabase/supaLegend/init";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useResyncTodosOnReconnect } from "@/utils/supabase/useResyncTodosOnReconnect";
import { useSyncClerkToLegend } from "@/utils/supabase/useSyncClerkToLegend";
import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env"
  );
}

export const queryClient = new QueryClient();

// 👇 This lives *inside* ClerkProvider
function AppShell({ colorScheme }: { colorScheme: "light" | "dark" | null | undefined }) {
  // This is now safe: useSession() sees ClerkProvider above it
  // console.log("AppShell rendered, setting up Supabase client with Clerk auth");
  const supabase = useClerkSupabaseClient();
  useResyncTodosOnReconnect();
  useSyncClerkToLegend();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <TripModeGate />
        <SyncStatusIndicator />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen
            name="trip-mode"
            options={{
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <RootErrorBoundary>
      <ClerkProvider
        tokenCache={tokenCache}
        __experimental_resourceCache={resourceCache}
        publishableKey={publishableKey}
      >
        <ClerkLoaded>
          <AppShell colorScheme={colorScheme} />
        </ClerkLoaded>
      </ClerkProvider>
    </RootErrorBoundary>
  );
}
