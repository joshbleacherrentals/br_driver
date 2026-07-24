import { getAuthStyles } from "@/constants/AuthStyles";
import { BRAND_BLUE, DARK_BLUE } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { LogOut } from "lucide-react-native";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type StatusScreenProps = {
  title: string;
  subtitle: string;
  /** Optional filled call-to-action shown above the logout link. */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Show the "Log Out" link (default true). */
  showLogout?: boolean;
  /** Confirm before logging out (default true). */
  confirmLogout?: boolean;
};

/**
 * Shared full-screen state message (logo + title + subtitle + optional CTA +
 * logout). Backs NoDriverScreen, PoorConnectionScreen and AuthErrorScreen so
 * the layout stays identical across gate states.
 */
export default function StatusScreen({
  title,
  subtitle,
  primaryLabel,
  onPrimary,
  showLogout = true,
  confirmLogout = true,
}: StatusScreenProps) {
  const colorScheme = useColorScheme();
  const styles = getAuthStyles(colorScheme);
  const localStyles = makeStyles(colorScheme === "dark");
  const { signOut } = useAuth();

  const doSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const onLogout = () => {
    if (!confirmLogout) {
      void doSignOut();
      return;
    }
    Alert.alert(
      "Are you sure?",
      "You will not be able to log back in without internet connection",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", onPress: () => void doSignOut() },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 72,
          paddingBottom: 32,
          flexGrow: 1,
        }}
      >
        <View style={styles.headerContainer}>
          <Image
            source={require("@/assets/images/NEW-Bleacher-Rentals-logo.png")}
            style={{ width: 200, height: 60, marginBottom: 16, marginTop: 28 }}
            contentFit="contain"
            accessibilityLabel="Bleacher Rentals"
          />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {primaryLabel && onPrimary && (
          <TouchableOpacity
            style={localStyles.primaryButton}
            onPress={onPrimary}
            activeOpacity={0.8}
          >
            <Text style={localStyles.primaryButtonText}>{primaryLabel}</Text>
          </TouchableOpacity>
        )}

        {showLogout && (
          <TouchableOpacity
            style={localStyles.logoutButton}
            onPress={onLogout}
            activeOpacity={0.7}
          >
            <LogOut
              size={16}
              color={colorScheme === "dark" ? "#8E8E93" : DARK_BLUE}
              strokeWidth={2}
            />
            <Text style={localStyles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    primaryButton: {
      backgroundColor: BRAND_BLUE,
      borderRadius: 8,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: 0.3,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      marginTop: 8,
      marginBottom: 36,
    },
    logoutButtonText: {
      color: isDark ? "#8E8E93" : DARK_BLUE,
      fontWeight: "500",
      fontSize: 16,
    },
  });
}
