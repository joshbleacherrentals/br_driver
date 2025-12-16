import { PRIMARY } from "@/constants/AuthStyles";
import { activeTrip$ } from "@/state/session/activeTrip";
import { workTrackers$ } from "@/state/stores/workTrackers.store";
import { useSelector } from "@legendapp/state/react";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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

export default function TripModePage() {
  const router = useRouter();
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>("none");

  // Get the active trip directly from the computed observable
  const workTracker = useSelector(() => activeTrip$.get());

  // Disable back button/gesture to prevent leaving trip mode
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      Alert.alert(
        "Trip in Progress",
        "You must complete the trip before returning to the trips list.",
        [{ text: "OK" }]
      );
      return true;
    });

    return () => backHandler.remove();
  }, []);

  // Check inspection status early - check for FK IDs instead of JSONB data
  const hasPreTripInspection = !!workTracker?.pre_inspection_uuid;
  const hasPostTripInspection = !!workTracker?.post_inspection_uuid;

  // If both inspections are complete, trip is finished - redirect
  useEffect(() => {
    if (hasPreTripInspection && hasPostTripInspection) {
      const timer = setTimeout(() => {
        router.replace("/(tabs)");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [hasPreTripInspection, hasPostTripInspection, router]);

  if (!workTracker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No active trip</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.buttonText}>Go to Trips</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show inspection forms first, before main view
  if (inspectionMode === "pre-trip") {
    return (
      <SafeAreaView style={styles.container}>
        <InspectionForm
          workTrackerKey={workTracker.legend_state_uuid}
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
          workTrackerKey={workTracker.legend_state_uuid}
          type="post-trip"
          onComplete={() => {
            Alert.alert("Trip Complete", "Your trip has been completed successfully!", [
              {
                text: "OK",
                onPress: () => {
                  router.replace("/(tabs)");
                  workTrackers$[workTracker.legend_state_uuid].status.set("completed");
                },
              },
            ]);
          }}
          onCancel={() => setInspectionMode("none")}
        />
      </SafeAreaView>
    );
  }

  // Format data - no longer needed, components pull from activeTrip$ directly

  // Main trip mode view
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header with Pay, Bleacher, Notes */}
        <TripHeader />

        {/* DEV: Back button to exit trip mode */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => workTrackers$[workTracker.legend_state_uuid].status.set("accepted")}
        >
          <Text style={styles.buttonText}>Back (Dev)</Text>
        </TouchableOpacity>

        {/* Pickup Card - Always enabled */}
        <TripLocationCard type="pickup" onStartInspection={() => setInspectionMode("pre-trip")} />

        {/* Dropoff Card - Disabled until pre-trip complete */}
        <TripLocationCard type="dropoff" onStartInspection={() => setInspectionMode("post-trip")} />

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
