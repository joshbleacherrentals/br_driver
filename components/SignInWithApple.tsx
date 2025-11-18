import { useSSO } from "@clerk/clerk-expo";
import { AntDesign } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS === "web") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

// Example props that you could pass to your button
interface AppleSignInButtonProps {
  // Callback function that is called when the sign-in is complete
  onSignInComplete?: () => void;
  // Whether to show a divider between the button and the text
  showDivider?: boolean;
  // Callback function that is called when an error occurs
  onError?: (err: unknown) => void;
}

export function AppleSignInButton({
  onSignInComplete,
  showDivider = true,
  onError,
}: AppleSignInButtonProps) {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  // Only render on iOS
  if (Platform.OS !== "ios") {
    return null;
  }

  const handleAppleSignIn = useCallback(async () => {
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "brdriver",
        path: "oauth-native-callback",
      });

      console.log("Apple OAuth Redirect URL:", redirectUrl);

      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_apple",
        redirectUrl,
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
        onSignInComplete ? onSignInComplete() : router.replace("/");
      } else {
        throw new Error("Failed to create session");
      }
    } catch (err: any) {
      // User canceled the sign-in flow
      if (err.code === "ERR_REQUEST_CANCELED" || err.code === "ERR_CANCELED") return;

      console.error("Apple Sign-In error:", err);
      if (onError) {
        onError(err);
      } else {
        Alert.alert("Error", err.message || "An error occurred during Apple Sign-In");
      }
    }
  }, [startSSOFlow, onSignInComplete, router, onError]);

  return (
    <>
      <TouchableOpacity style={styles.appleButton} onPress={handleAppleSignIn}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <AntDesign name="apple" size={18} color="#ffffff" />
          <Text style={[styles.appleButtonText, { marginLeft: 8 }]}>Sign in with Apple</Text>
        </View>
      </TouchableOpacity>

      {showDivider && (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    backgroundColor: "#000",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  appleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ccc",
  },
  dividerText: {
    marginHorizontal: 10,
    color: "#666",
  },
});
