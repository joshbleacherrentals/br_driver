import { PRIMARY } from "@/constants/AuthStyles";
import { fetchWorkTrackersForClerkUser } from "@/db/online/workTrackers";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { formatPayment } from "@/utils/workTrackerUtils";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import InspectionForm from "../../components/InspectionForm";
import TripHeader from "../../components/TripHeader";
import TripLocationCard from "../../components/TripLocationCard";

type InspectionMode = "none" | "pre-trip" | "post-trip";

export default function TripModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const supabase = useClerkSupabaseClient();
  const router = useRouter();
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>("none");

  // Disable back button/gesture to prevent leaving trip mode
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      // Return true to prevent default back behavior
      Alert.alert(
        "Trip in Progress",
        "You must complete the trip before returning to the trips list.",
        [{ text: "OK" }]
      );
      return true;
    });

    return () => backHandler.remove();
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!userId,
    queryFn: async () => {
      return await fetchWorkTrackersForClerkUser(supabase, userId);
    },
  });

  const workTracker = data?.workTrackers?.find((wt) => wt.work_tracker_id === parseInt(id || "0"));

  // Check inspection status early - check for FK IDs instead of JSONB data
  const hasPreTripInspection = !!workTracker?.pre_inspection_id;
  const hasPostTripInspection = !!workTracker?.post_inspection_id;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (isError || !workTracker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Trip not found</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // If both inspections are complete, trip is finished - redirect
  useEffect(() => {
    if (hasPreTripInspection && hasPostTripInspection) {
      const timer = setTimeout(() => {
        router.replace("/(tabs)");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [hasPreTripInspection, hasPostTripInspection, router]);

  // Show inspection forms first, before main view
  if (inspectionMode === "pre-trip") {
    return (
      <SafeAreaView style={styles.container}>
        <InspectionForm
          workTrackerId={workTracker.work_tracker_id}
          type="pre-trip"
          onComplete={() => setInspectionMode("none")}
          onCancel={() => setInspectionMode("none")}
        />
      </SafeAreaView>
    );
  }

  if (inspectionMode === "post-trip") {
    return (
      <SafeAreaView style={styles.container}>
        <InspectionForm
          workTrackerId={workTracker.work_tracker_id}
          type="post-trip"
          onComplete={() => {
            Alert.alert("Trip Complete", "Your trip has been completed successfully!", [
              { text: "OK", onPress: () => router.replace("/(tabs)") },
            ]);
          }}
          onCancel={() => setInspectionMode("none")}
        />
      </SafeAreaView>
    );
  }

  // Format data
  const payStr = formatPayment(workTracker.pay_cents);
  const bleacherStr = workTracker.bleacher?.bleacher_number
    ? `Bleacher #${workTracker.bleacher.bleacher_number}`
    : "";

  const pickupAddr = workTracker.pickup_address
    ? `${workTracker.pickup_address.street}, ${workTracker.pickup_address.city}, ${
        workTracker.pickup_address.state_province
      }${workTracker.pickup_address.zip_postal ? " " + workTracker.pickup_address.zip_postal : ""}`
    : "";

  const dropoffAddr = workTracker.dropoff_address
    ? `${workTracker.dropoff_address.street}, ${workTracker.dropoff_address.city}, ${
        workTracker.dropoff_address.state_province
      }${
        workTracker.dropoff_address.zip_postal ? " " + workTracker.dropoff_address.zip_postal : ""
      }`
    : "";

  // Main trip mode view
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header with Pay, Bleacher, Notes */}
        <TripHeader
          payAmount={payStr}
          bleacherNumber={bleacherStr}
          notes={workTracker.notes || undefined}
        />

        {/* Pickup Card - Always enabled */}
        <TripLocationCard
          type="pickup"
          stepNumber={1}
          address={pickupAddr}
          time={workTracker.pickup_time || undefined}
          poc={workTracker.pickup_poc || undefined}
          inspectionCompleted={hasPreTripInspection}
          onStartInspection={() => setInspectionMode("pre-trip")}
        />

        {/* Dropoff Card - Disabled until pre-trip complete */}
        <TripLocationCard
          type="dropoff"
          stepNumber={2}
          address={dropoffAddr}
          time={workTracker.dropoff_time || undefined}
          poc={workTracker.dropoff_poc || undefined}
          inspectionCompleted={hasPostTripInspection}
          inspectionDisabled={!hasPreTripInspection}
          onStartInspection={() => setInspectionMode("post-trip")}
        />

        {/* Both Inspections Complete */}
        {hasPreTripInspection && hasPostTripInspection && (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Trip Complete!</Text>
            <Text style={styles.successMessage}>
              All inspections finished. Returning to trips list...
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  successCard: {
    backgroundColor: "#E8F8F0",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#34C759",
  },
  successIcon: {
    fontSize: 48,
    color: "#34C759",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    color: "#EF4444",
    marginBottom: 24,
    textAlign: "center",
    fontWeight: "600",
  },
  button: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
