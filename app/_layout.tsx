// app/_layout.tsx
import TripModeLockGuard from "@/components/TripModeLockGuard";
import { useColorScheme } from "@/hooks/useColorScheme";
import { RootErrorBoundary } from "@/utils/RootErrorBoundary";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useResyncTodosOnReconnect } from "@/utils/supabase/useResyncTodosOnReconnect";
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

// 👇 This lives *inside* ClerkProvider
function AppShell({ colorScheme }: { colorScheme: "light" | "dark" | null | undefined }) {
  // This is now safe: useSession() sees ClerkProvider above it
  console.log("AppShell rendered, setting up Supabase client with Clerk auth");
  useClerkSupabaseClient();
  useResyncTodosOnReconnect();

  const queryClient = new QueryClient();

  return (
    // <SupabaseAuthSync>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <TripModeLockGuard />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen
            name="trip-mode/[id]"
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
    // </SupabaseAuthSync>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    console.log("Fonts not loaded yet");
    return null;
  }
  console.log("Fonts loaded");

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
