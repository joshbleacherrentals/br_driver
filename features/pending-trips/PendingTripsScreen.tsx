import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import PendingTripsList from "./components/PendingTripsList";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { View } from "react-native";

export default function PendingTripsScreen() {
  const colorScheme = useColorScheme();
  const bg = colorScheme === "dark" ? "#000000" : "#F2F2F7";

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ProfileCompletionBanner />
      <DocExpiryWarningBanner />
      <PendingTripsList />
    </View>
  );
}
