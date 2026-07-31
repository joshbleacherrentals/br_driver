import { getAuthStyles } from "@/constants/AuthStyles";
import { useTheme } from "@/hooks/useTheme";
import { useSSO } from "@clerk/clerk-expo";
import { OAuthStrategy } from "@clerk/types";
import { AntDesign } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";

export const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS === "web") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};
WebBrowser.maybeCompleteAuthSession();

interface Props {
  strategy: OAuthStrategy;
  children: React.ReactNode;
  onError?: (err: unknown) => void;
}

export default function OAuthButton({ strategy, children, onError }: Props) {
  useWarmUpBrowser();
  const { scheme } = useTheme();
  const styles = useMemo(() => getAuthStyles(scheme), [scheme]);
  const { startSSOFlow } = useSSO();

  const onPress = useCallback(async () => {
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        // scheme: "brdriver",
        path: "oauth-native-callback",
      });

      console.log("OAuth Redirect URL:", redirectUrl);

      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl,
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
      } else {
        throw new Error("Failed to create session");
      }
    } catch (err) {
      console.error("OAuth error:", err);
      if (onError) {
        onError(err);
      }
    }
  }, [startSSOFlow, strategy, onError]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <AntDesign name="google" size={18} color={styles.buttonText.color} />
        <Text style={[styles.buttonText, { marginLeft: 8 }]}>{children}</Text>
      </View>
    </TouchableOpacity>
  );
}
