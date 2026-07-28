import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import PendingTripsList from "./components/PendingTripsList";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import { View } from "react-native";

export default function PendingTripsScreen() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ProfileCompletionBanner />
      <DocExpiryWarningBanner />
      <PendingTripsList />
    </View>
  );
}
