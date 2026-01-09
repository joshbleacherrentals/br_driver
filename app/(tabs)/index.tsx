import React, { useState } from 'react';
import TripItem from "@/components/widgets/trip_item";
import InspectionScreen from "@/components/widgets/inspection";
import { EnrichedWorkTracker, fetchWorkTrackersForClerkUser } from "@/db/workTrackers";
import { supabase } from "@/library/supabase/supabaseClient";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { Alert, FlatList, Image, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";
type InspectionType = 'pickup' | 'dropoff';

export default function TripsScreen() {
  const { getToken, isSignedIn, userId } = useAuth();
  const [inspectionData, setInspectionData] = useState<{
    workTrackerId: number;
    type: InspectionType;
  } | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!isSignedIn && !!userId,
    queryFn: async () => {
      const token = await getToken({ template: "supabase" });
      return await fetchWorkTrackersForClerkUser(token ?? null, userId);
    },
  });

  const workTrackers = (data?.workTrackers ?? []) as EnrichedWorkTracker[];

  // Handler functions
  const handleAccept = async (workTrackerId: number) => {
    try {
      const { error } = await supabase
        .from("WorkTrackers")
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('work_tracker_id', workTrackerId);

      if (error) throw error;
      
      console.log("Trip accepted:", workTrackerId);
      refetch();
    } catch (err) {
      console.error("Error updating trip status:", err);
      Alert.alert("Error", "Failed to accept trip. Please try again.");
    }
  };

  const handleStartTrip = async (workTrackerId: number) => {
    try {
      Alert.alert(
        "Start Trip",
        "Ready to start this trip?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Start",
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from("WorkTrackers")
                  .update({ 
                    status: 'dest_pickup',
                    started_at: new Date().toISOString()
                  })
                  .eq('work_tracker_id', workTrackerId);

                if (error) throw error;

                console.log("Trip started:", workTrackerId);
                refetch();
              } catch (err) {
                console.error("Error updating trip status:", err);
                Alert.alert("Error", "Failed to start trip. Please try again.");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error starting trip:", error);
      Alert.alert("Error", "Failed to start trip. Please try again.");
    }
  };

  const handleArrived = async (workTrackerId: number) => {
    try {
      const currentTrip = workTrackers.find(t => t.work_tracker_id === workTrackerId);
      const isAtPickup = currentTrip?.status === 'dest_pickup';
      
      Alert.alert(
        "Arrived",
        `Have you arrived at the ${isAtPickup ? 'pickup' : 'drop-off'} location?`,
        [
          { text: "Not Yet", style: "cancel" },
          {
            text: "Yes, I've Arrived",
            onPress: async () => {
              try {
                if (isAtPickup) {
                  // Update status to pickup inspection (intermediary state)
                  const { error } = await supabase
                    .from("WorkTrackers")
                    .update({ 
                      status: 'pickup_inspection'
                    })
                    .eq('work_tracker_id', workTrackerId);

                  if (error) throw error;
                } else {
                  // Update status to dropoff inspection (intermediary state)
                  const { error } = await supabase
                    .from("WorkTrackers")
                    .update({ 
                      status: 'dropoff_inspection'
                    })
                    .eq('work_tracker_id', workTrackerId);

                  if (error) throw error;
                }
                
                console.log("Arrival updated for trip:", workTrackerId);
                refetch();
              } catch (err) {
                console.error("Error updating arrival:", err);
                Alert.alert("Error", "Failed to update arrival status. Please try again.");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error updating arrival:", error);
      Alert.alert("Error", "Failed to update arrival status. Please try again.");
    }
  };

  const handleStartInspection = (workTrackerId: number, type: 'pickup' | 'dropoff') => {
    // Navigate to inspection screen
    setInspectionData({
      workTrackerId,
      type
    });
  };

  const handleSkip = async (workTrackerId: number) => {
    Alert.alert(
      "Skip Trip",
      "Are you sure you want to skip this trip? This will move it to the end of your queue.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: async () => {
            try {
              // TODO: Implement skip logic - maybe update a skip_count or reorder
              console.log("Skipping trip:", workTrackerId);
              refetch();
            } catch (err) {
              console.error("Error skipping trip:", err);
              Alert.alert("Error", "Failed to skip trip. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleInspectionComplete = async (workTrackerId: number) => {
    const currentTrip = workTrackers.find(t => t.work_tracker_id === workTrackerId);
    const isAtPickup = currentTrip?.status === 'pickup_inspection';

    setInspectionData(null);
    if (isAtPickup) {
      // Update status to pickup inspection (intermediary state)
      const { error } = await supabase
        .from("WorkTrackers")
        .update({ 
          status: 'dest_dropoff'
        })
        .eq('work_tracker_id', workTrackerId);

      if (error) throw error;
    } else {
      // Update status to dropoff inspection (intermediary state)
      const { error } = await supabase
        .from("WorkTrackers")
        .update({ 
          status: 'completed'
        })
        .eq('work_tracker_id', workTrackerId);

      if (error) throw error;
    }

    refetch();
  };

  const handleInspectionCancel = () => {
    setInspectionData(null);
  };

  // Show inspection screen if inspection data is set
  if (inspectionData) {
    return (
      <InspectionScreen
        workTrackerId={inspectionData.workTrackerId}
        inspectionType={inspectionData.type}
        onComplete={() => { void handleInspectionComplete(inspectionData.workTrackerId); }}
        onCancel={handleInspectionCancel}
      />
    );
  }

  const logo = require('../../assets/images/adaptive-icon.png');

  // Show trips list
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BLUE }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 50 }}>
        <Image 
          source={logo} 
          style={{ width: 45, height: 45 }}
        />
        <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: 0.3, color: '#111827'}}>Upcoming Trips</Text>
        <View style={{ height: 8 }} />
        <Text onPress={() => refetch()} style={{ color: "#007AFF" }}>
          {isLoading || isRefetching ? "Refreshing…" : "Refresh"}
        </Text>
        {isError ? <Text style={{ color: "red" }}>{(error as Error)?.message}</Text> : null}
      </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: 50, paddingTop: 8 }}
        data={workTrackers}
        keyExtractor={(item) => String(item.work_tracker_id)}
        renderItem={({ item }) => (
          <TripItem
            workTracker={item}
            onAccept={handleAccept}
            onStartTrip={handleStartTrip}
            onSkip={handleSkip}
            onArrived={handleArrived}
            onStartInspection={handleStartInspection}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666" }}>{isLoading ? "Loading…" : "No trips yet."}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}