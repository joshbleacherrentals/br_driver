import { useSSO } from "@clerk/clerk-expo";
import { AntDesign } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { type ThemeColors, typeScale } from "@/constants/theme";

import { useThemedStyles } from "@/hooks/useThemedStyles";
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

interface AppleSignInButtonProps {
  onSignInComplete?: () => void;
  showDivider?: boolean;
  onError?: (err: unknown) => void;
}

export function AppleSignInButton({
  onSignInComplete,
  showDivider = true,
  onError,
}: AppleSignInButtonProps) {
  useWarmUpBrowser();
  const styles = useThemedStyles(makeStyles);
  const { startSSOFlow } = useSSO();
  const router = useRouter();

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
      if (err.code === "ERR_REQUEST_CANCELED" || err.code === "ERR_CANCELED")
        return;

      console.error("Apple Sign-In error:", err);
      if (onError) {
        onError(err);
      } else {
        Alert.alert(
          "Error",
          err.message || "An error occurred during Apple Sign-In",
        );
      }
    }
  }, [startSSOFlow, onSignInComplete, router, onError]);

  if (Platform.OS !== "ios") {
    return null;
  }

  return (
    <>
      <TouchableOpacity style={styles.appleButton} onPress={handleAppleSignIn}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <AntDesign name="apple" size={18} color={styles.appleButtonText.color} />
          <Text style={[styles.appleButtonText, { marginLeft: 8 }]}>
            Sign in with Apple
          </Text>
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

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    appleButton: {
      backgroundColor: theme.accent,
      padding: 15,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    appleButtonText: {
      color: theme.onAccent,
      ...typeScale.callout,
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
      backgroundColor: theme.separator,
    },
    dividerText: {
      marginHorizontal: 10,
      color: theme.textSecondary,
    },
  });
}
