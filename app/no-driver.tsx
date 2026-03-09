import { getAuthStyles } from "@/constants/AuthStyles";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useUser } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";

export default function NoDriverScreen() {
  const colorScheme = useColorScheme();
  const styles = getAuthStyles(colorScheme);
  const { user } = useUser();
  const firstName = user?.firstName || "there";

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
            Looks like you don't have a driver profile set up yet.
            Please contact your account manager to get started.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}