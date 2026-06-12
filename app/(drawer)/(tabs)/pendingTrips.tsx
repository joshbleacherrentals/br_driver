import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import PendingTripsList from "@/components/widgets/PendingTripsList";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { SafeAreaView, } from "react-native-safe-area-context";

export default function PendingTripsScreen() {
  const colorScheme = useColorScheme();
  const bg = colorScheme === "dark" ? "#000000" : "#F2F2F7";

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: bg }}>
      <ProfileCompletionBanner />
      <PendingTripsList />
    </SafeAreaView>
  );
}
