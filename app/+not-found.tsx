import { getAuthStyles } from "@/constants/AuthStyles";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useUser } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function NotFoundScreen() {
  const colorScheme = useColorScheme();
  const styles = getAuthStyles(colorScheme);
  const router = useRouter();
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
            You&apos;re signed in and ready to go. Check out your upcoming trips to get started.
          </Text>
        </View>

        <View style={styles.form}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace("/(tabs)")}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>View Your Upcoming Trips</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}
