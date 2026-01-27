import React, { useState } from 'react';
import TripItem from "@/components/widgets/trip_item";
import InspectionScreen from "@/components/widgets/inspection";
import { fetchWorkTrackers } from "@/db/workTrackers";
import { Alert, FlatList, Image, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from '@/components/providers/SystemProvider';
import { executeTypedMutationVoid } from '@/library/powersync/typedMutation';
import ProfileCompletionBanner from '@/components/widgets/onboardingBanner';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";
type InspectionType = 'pickup' | 'dropoff';

export default function TripsScreen() {
  const [inspectionData, setInspectionData] = useState<{
    workTrackerId: string;
    type: InspectionType;
  } | null>(null);

  const workTrackers = fetchWorkTrackers().workTrackers;
  const { isProfileComplete } = useProfileCompletion();

  // Handler functions
  const handleAccept = async (workTrackerId: string) => {
    if ( !isProfileComplete ) {
      Alert.alert("Error", "Complete your profile before you can accept any trips")
      return;
    }
    try {
      const now = new Date().toISOString();
      const query = db
        .updateTable('WorkTrackers')
        .set({
          status: 'accepted',
          accepted_at: now,
          updated_at: now,
        })
        .where('id', '=', workTrackerId)
        .compile();

      await executeTypedMutationVoid(query);
      console.log("Trip accepted:", workTrackerId);
    } catch (error) {
      console.error("Error:", error);
      Alert.alert("Error", "Failed to accept trip.");
    }
  };

  const handleStartTrip = async (workTrackerId: string) => {
    Alert.alert(
      "Start Trip",
      "Ready to start this trip?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          onPress: async () => {
            try {
              const now = new Date().toISOString();
              const query = db
                .updateTable('WorkTrackers')
                .set({
                  status: 'dest_pickup',
                  started_at: now,
                  updated_at: now
                })
                .where('id', '=', workTrackerId)
                .compile();

              await executeTypedMutationVoid(query);
              console.log("Trip started:", workTrackerId);
            } catch (error) {
              console.error("Error updating trip status:", error);
              Alert.alert("Error", "Failed to start trip. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleArrived = async (workTrackerId: string) => {
    try {
      const currentTrip = workTrackers?.find(t => t.id === workTrackerId);
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
                const newStatus = isAtPickup ? 'pickup_inspection' : 'dropoff_inspection';
                const now = new Date().toISOString();
                
                const query = db
                  .updateTable('WorkTrackers')
                  .set({
                    status: newStatus,
                    updated_at: now
                  })
                  .where('id', '=', workTrackerId)
                  .compile();

               await executeTypedMutationVoid(query);
                console.log(`${isAtPickup ? 'Pickup' : 'Dropoff'} inspection started:`, workTrackerId);
              } catch (err) {
                console.error("Error updating status:", err);
                Alert.alert("Error", "Failed to update inspection status. Please try again.");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error updating inspection:", error);
      Alert.alert("Error", "Failed to update inspection status. Please try again.");
    }
  };

  const handleStartInspection = (workTrackerId: string, type: 'pickup' | 'dropoff') => {
    setInspectionData({
      workTrackerId,
      type
    });
  };

  const handleSkip = async (workTrackerId: string) => {
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
              const now = new Date().toISOString();
              const query = db
                .updateTable('WorkTrackers')
                .set({
                  status: 'cancelled',
                  updated_at: now
                })
                .where('id', '=', workTrackerId)
                .compile();

              await executeTypedMutationVoid(query);
              console.log("Trip cancelled:", workTrackerId);
            } catch (err) {
              console.error("Error skipping trip:", err);
              Alert.alert("Error", "Failed to skip trip. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleInspectionComplete = async (workTrackerId: string) => {
    try {
      const currentTrip = workTrackers?.find(t => t.id === workTrackerId);
      const isAtPickup = currentTrip?.status === 'pickup_inspection';
      const newStatus = isAtPickup ? 'dest_dropoff' : 'completed';
      const now = new Date().toISOString();

      setInspectionData(null);

      if (newStatus === 'completed') {
        const query = db
          .updateTable('WorkTrackers')
          .set({
            status: newStatus,
            completed_at: now,
            updated_at: now
          })
          .where('id', '=', workTrackerId)
          .compile();

        await executeTypedMutationVoid(query);
        console.log("Completed trip:", workTrackerId);
      } else {
        const query = db
          .updateTable('WorkTrackers')
          .set({
            status: newStatus,
            updated_at: now
          })
          .where('id', '=', workTrackerId)
          .compile();

        await executeTypedMutationVoid(query);
        console.log("Destination dropoff:", workTrackerId);
      }

      console.log(`Inspection complete, status updated to: ${newStatus}`);
    } catch (error) {
      console.error("Error completing inspection:", error);
      Alert.alert("Error", "Failed to complete inspection. Please try again.");
    }
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
      </View>

      <ProfileCompletionBanner />

      <FlatList
        contentContainerStyle={{ paddingBottom: 50, paddingTop: 8 }}
        data={workTrackers}
        keyExtractor={(item) => String(item.id)}
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
            <Text style={{ color: "#666" }}>{"No trips yet."}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}