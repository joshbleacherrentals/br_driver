import { Colors } from "@/constants/Colors";
import { useSSO } from "@clerk/clerk-expo";
import AntDesign from "@expo/vector-icons/AntDesign";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export const useWarmUpBrowser = () => {
  useEffect(() => {
    // Preloads the browser for Android devices to reduce authentication load time
    // See: https://docs.expo.dev/guides/authentication/#improving-user-experience
    void WebBrowser.warmUpAsync();
    return () => {
      // Cleanup: closes browser when component unmounts
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

// Handle any pending authentication sessions
WebBrowser.maybeCompleteAuthSession();

export default function Page() {
  useWarmUpBrowser();

  // Use the `useSSO()` hook to access the `startSSOFlow()` method
  const { startSSOFlow } = useSSO();

  const onPress = useCallback(async () => {
    try {
      // Build a stable redirect URL for native + Expo Go
      // - In Expo Go, use the AuthSession proxy (https://auth.expo.io/@user/slug)
      // - In development clients/production, use the app scheme
      const isExpoGo = Constants.appOwnership === "expo";
      // Build redirect once; avoid AuthSession.getRedirectUrl to prevent proxy errors in Expo Go
      const owner = (Constants.expoConfig as any)?.owner as string | undefined;
      const slug = (Constants.expoConfig as any)?.slug || "br_driver";
      // In Expo Go, use the Expo AuthSession proxy with the callback path appended.
      // Clerk must have BOTH of these in Authorized Redirect URLs:
      //   brdriver://oauth-native-callback
      //   https://auth.expo.io/@owner/slug/oauth-native-callback
      const redirectUrl = isExpoGo
        ? // Dev in Expo Go: use the proxy (returns https://auth.expo.io/@owner/slug)
          AuthSession.makeRedirectUri({
            preferLocalhost: false,
          })
        : // Native/dev-client/TestFlight/Play: use your app scheme
          AuthSession.makeRedirectUri({
            scheme: "brdriver",
            path: "oauth-native-callback",
          });

      if (__DEV__) {
        console.log("Clerk SSO redirect URL:", redirectUrl);
      }

      // Start the authentication process by calling `startSSOFlow()`
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
      }
    } catch (err: unknown) {
      // See https://clerk.com/docs/custom-flows/error-handling for patterns
      // Avoid JSON.stringify on unknown/circular errors; log raw and show message
      console.error("SSO error:", err);
      const message =
        (err as any)?.errors?.[0]?.longMessage ||
        (err as any)?.errors?.[0]?.message ||
        (err as any)?.message ||
        "Sign-in failed. Check redirect URLs in Clerk settings.";
      Alert.alert("Sign-in error", message);
    }
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <View style={styles.container}>
        <Image
          source={require("@/assets/images/NEW-Bleacher-Rentals-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Welcome to Bleacher Rentals</Text>
        <Text style={styles.subtitle}>Driver App</Text>

        <TouchableOpacity style={styles.button} onPress={onPress}>
          <View style={styles.buttonContent}>
            <AntDesign name="google" size={24} color={Colors.blue} />
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  logo: {
    width: 240,
    height: 120,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 40,
    textAlign: "center",
  },
  button: {
    borderWidth: 2,
    borderColor: Colors.blue,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    color: Colors.blue,
    fontWeight: "600",
    fontSize: 16,
  },
});
