import { getAuthStyles } from "@/constants/AuthStyles";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useSSO } from "@clerk/clerk-expo";
import { OAuthStrategy } from "@clerk/types";
import { AntDesign } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect } from "react";
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
  // The OAuthStrategy type from Clerk allows you to specify the provider you want to use in this specific instance of the OAuthButton component
  strategy: OAuthStrategy;
  children: React.ReactNode;
}

export default function OAuthButton({ strategy, children }: Props) {
  useWarmUpBrowser();
  const colorScheme = useColorScheme();
  const styles = getAuthStyles(colorScheme);
  // useSSO hook from Clerk SDK to support various SSO providers
  const { startSSOFlow } = useSSO();

  const onPress = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
      } else {
        throw new Error("Failed to create session");
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  }, [startSSOFlow, strategy]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.button} activeOpacity={0.85}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <AntDesign name="google" size={18} color="#ffffff" />
        <Text style={[styles.buttonText, { marginLeft: 8 }]}>{children}</Text>
      </View>
    </TouchableOpacity>
  );
}
