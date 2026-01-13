import React, { useState } from 'react';
import CompletedTrips from "@/components/widgets/completed_trip_item";
import { EnrichedWorkTracker, fetchWorkTrackersForClerkUser } from "@/db/workTrackers";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Image, Text, View, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

export default function CompletedTripsScreen() {
  const { getToken, isSignedIn, userId } = useAuth();
  const [selectedTrip, setSelectedTrip] = useState<EnrichedWorkTracker | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!isSignedIn && !!userId,
    queryFn: async () => {
      const token = await getToken({ template: "supabase" });
      return await fetchWorkTrackersForClerkUser(token ?? null, userId);
    },
  });

  const workTrackers = (data?.workTrackers ?? []) as EnrichedWorkTracker[];
  
  // Filter only completed trips
  const completedTrips = workTrackers.filter(t => t.status === 'completed');

  const formatPay = (cents: number | null) => {
    if (cents === null) return '';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateISO?: string | null) => {
    if (!dateISO) return 'No date';
    try {
      const d = new Date(dateISO);
      const day = d.getDate();
      const ord = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return (s as any)[(v - 20) % 10] || (s as any)[v] || s[0];
      };
      const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
      const month = d.toLocaleDateString(undefined, { month: 'short' });
      return `${weekday}, ${month} ${day}${ord(day)}`;
    } catch (error) {
      return 'Invalid date';
    }
  };

  const formatDateTime = (dateISO?: string | null) => {
    if (!dateISO) return 'N/A';
    try {
      const d = new Date(dateISO);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const handleTripPress = (trip: EnrichedWorkTracker) => {
    setSelectedTrip(trip);
  };

  const handleCloseDetail = () => {
    setSelectedTrip(null);
  };

  // Show detail view if trip is selected
  if (selectedTrip) {
    return (
      <CompletedTrips
        workTracker={selectedTrip}
        onClose={handleCloseDetail}
      />
    );
  }

  const logo = require('../../assets/images/adaptive-icon.png');

  // Show completed trips list
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
        data={completedTrips}
        keyExtractor={(item) => String(item.work_tracker_id)}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleTripPress(item)}>
            <View style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 16,
              marginVertical: 6,
              marginHorizontal: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}>
              {/* Header with Badge */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#000', marginBottom: 4 }}>
                    {item.bleacher && `Bleacher #${item.bleacher.bleacher_number}`}
                    {item.bleacher && item.pay_cents && ' - '}
                    {item.pay_cents && formatPay(item.pay_cents)}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#8E8E93' }}>
                    {formatDate(item.date)}
                  </Text>
                </View>
                <View style={{ backgroundColor: '#8E8E93', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 }}>
                    COMPLETED
                  </Text>
                </View>
              </View>

              {/* Completion Time */}
              {item.completed_at && (
                <View style={{ 
                  backgroundColor: '#F8F8F8', 
                  borderRadius: 8, 
                  padding: 10,
                  marginBottom: 12
                }}>
                  <Text style={{ fontSize: 12, color: '#8E8E93', marginBottom: 2 }}>
                    Completed At
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#000' }}>
                    {formatDateTime(item.completed_at)}
                  </Text>
                </View>
              )}

              {/* Addresses Preview */}
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: '#8E8E93', marginBottom: 4 }}>
                  📍 Pickup
                </Text>
                <Text style={{ fontSize: 14, color: '#000', marginBottom: 8 }}>
                  {item.pickup_address 
                    ? `${item.pickup_address.street}, ${item.pickup_address.city}`
                    : 'No address'}
                </Text>
                
                <Text style={{ fontSize: 12, color: '#8E8E93', marginBottom: 4 }}>
                  📍 Dropoff
                </Text>
                <Text style={{ fontSize: 14, color: '#000' }}>
                  {item.dropoff_address 
                    ? `${item.dropoff_address.street}, ${item.dropoff_address.city}`
                    : 'No address'}
                </Text>
              </View>

              {/* View Details Link */}
              <Text style={{ fontSize: 14, color: '#0A84FF', fontWeight: '600', marginTop: 8 }}>
                Tap to view full details and inspections →
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: "#666", textAlign: 'center' }}>
              {isLoading ? "Loading…" : "No completed trips yet."}
            </Text>
            {!isLoading && completedTrips.length === 0 && (
              <Text style={{ fontSize: 14, color: "#8E8E93", textAlign: 'center', marginTop: 8 }}>
                Completed trips will appear here once you finish your deliveries.
              </Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}