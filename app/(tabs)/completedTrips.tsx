import React, { useState, useMemo } from 'react';
import CompletedTrips from "@/components/widgets/completed_trip_item";
import { WorkTracker, fetchWorkTrackers } from "@/db/workTrackers";
import { useBatchAddresses } from '@/db/fetchAddress';
import { useBatchBleachers } from '@/db/fetchBleacher';
import { FlatList, Image, Text, View, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

export default function CompletedTripsScreen() {
  const [selectedTrip, setSelectedTrip] = useState<WorkTracker | null>(null);

  const workTrackers = fetchWorkTrackers().workTrackers;
  
  // Filter only completed trips
  console.log("All WorkTrackers:", workTrackers);
  const completedTrips = workTrackers ? workTrackers.filter(t => t.status === 'completed') || [] : [];

  // Collect all address IDs that need to be fetched
  const allAddressIds = useMemo(() => {
    const ids: (string | null)[] = [];
    completedTrips.forEach(trip => {
      ids.push(trip.pickup_address_uuid);
      ids.push(trip.dropoff_address_uuid);
    });
    return ids;
  }, [completedTrips]);

  const allAddresses = useBatchAddresses(allAddressIds);
  const allBleachers = useBatchBleachers(
    completedTrips.map(t => t.bleacher_uuid)
  );

  const formatPay = (cents: number | null) => {
    if (cents === null) return '';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateISO?: string | null) => {
    if (!dateISO) return 'Date not set';
    try {
      const d = new Date(dateISO + 'T00:00:00');
      const day = d.getDate();
      const ord = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return (s as any)[(v - 20) % 10] || (s as any)[v] || s[0];
      };
      const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
      const month_short = d.toLocaleDateString(undefined, { month: 'short' });
      return `${weekday}, ${month_short} ${day}${ord(day)}`;
    } catch (error) {
      return 'Invalid date';
    }
  };

  const formatDateTime = (dateISO?: string | null) => {
    if (!dateISO) return '';
    try {
      // Check if it's a date-only string (YYYY-MM-DD) or full ISO timestamp
      if (dateISO.length === 10 && dateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Date only - parse as local midnight
        const [year, month, day] = dateISO.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        return d.toLocaleString();
      } else {
        // Full timestamp - use as-is (it has timezone info)
        return new Date(dateISO).toLocaleString();
      }
    } catch {
      return dateISO ?? '';
    }
  };

  const handleTripPress = (trip: WorkTracker) => {
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
           <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: 0.3, color: '#111827'}}>Completed Trips</Text>
           <View style={{ height: 8 }} />
         </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: 50, paddingTop: 8 }}
        data={completedTrips}
        renderItem={({ item }) => {
          const pickupAddress = item.pickup_address_uuid ? allAddresses[item.pickup_address_uuid] : null;
          const dropoffAddress = item.dropoff_address_uuid ? allAddresses[item.dropoff_address_uuid] : null;
          const bleacher = item.bleacher_uuid ? allBleachers[item.bleacher_uuid] : null;

          return (
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
                      {item.bleacher_uuid && `Bleacher #${bleacher?.bleacher_number}`}
                      {item.bleacher_uuid && item.pay_cents && ' - '}
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
                    {pickupAddress
                      ? `${pickupAddress.street}, ${pickupAddress.city}`
                      : 'No address'}
                  </Text>
                  
                  <Text style={{ fontSize: 12, color: '#8E8E93', marginBottom: 4 }}>
                    📍 Dropoff
                  </Text>
                  <Text style={{ fontSize: 14, color: '#000' }}>
                    {dropoffAddress 
                      ? `${dropoffAddress.street}, ${dropoffAddress.city}`
                      : 'No address'}
                  </Text>
                </View>

                {/* View Details Link */}
                <Text style={{ fontSize: 14, color: '#0A84FF', fontWeight: '600', marginTop: 8 }}>
                  Tap to view full details and inspections →
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16, alignItems: 'center' }}>
            {completedTrips.length === 0 && (
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