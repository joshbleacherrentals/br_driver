import { getAuthStyles } from "@/constants/AuthStyles";
import { DARK_BLUE } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth, useUser } from "@clerk/clerk-expo";
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

export default function NoDriverScreen() {
  const colorScheme = useColorScheme();
  const styles = getAuthStyles(colorScheme);
  const localStyles = makeStyles(colorScheme === "dark");
  const { signOut } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName || "there";

  const onLogout = async () => {
    Alert.alert(
      "Are you sure?",
      "You will not be able to log back in without internet connection",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          },
        },
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
          <Text style={styles.title}>Welcome, {firstName}!</Text>
          <Text style={styles.subtitle}>
            Looks like you don&apos;t have a driver profile set up yet. Please
            contact your account manager to get started.
          </Text>
        </View>
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
      </ScrollView>
    </>
  );
}

function makeStyles(isDark: boolean) {
  const text = isDark ? "#FFFFFF" : "#000000";
  const border = isDark ? "rgba(255,255,255,0.08)" : "#F2F2F7";
  return StyleSheet.create({
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
