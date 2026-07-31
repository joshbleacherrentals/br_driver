import CompletedTrips from "@/features/trip-history/components/CompletedTripItem";
import { ThemeColors } from "@/constants/theme";
import { useWorkTracker } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function CompletedTripScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { workTrackerId } = useLocalSearchParams<{ workTrackerId?: string }>();
  const { workTracker, isLoading } = useWorkTracker(workTrackerId);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "card",
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : !workTracker ? (
        <View style={styles.centered}>
          <Text style={styles.notFound}>Trip not found.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.goBack}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <CompletedTrips
          workTracker={workTracker}
          onClose={() => router.back()}
        />
      )}
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.background,
    },
    notFound: { color: theme.textSecondary },
    goBack: { color: theme.accent, marginTop: 12 },
  });
