import CompletedTrips from "@/components/widgets/completed_trip_item";
import ProfileCompletionBanner from '@/components/widgets/onboardingBanner';
import { useBatchAddresses } from '@/hooks/db/useAddress';
import { useBatchBleachers } from '@/hooks/db/useBleacher';
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

// Returns the Monday of the week containing the given date
function getWeekStart(dateISO: string): Date {
  const d = new Date(dateISO + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function getWeekEnd(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function formatWeekRange(monday: Date, sunday: Date): string {
  const sameMonth = monday.getMonth() === sunday.getMonth();

  const monthFmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'long' });
  const dayOrd = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };

  if (sameMonth) {
    return `${monthFmt(monday)} ${dayOrd(monday.getDate())} – ${dayOrd(sunday.getDate())}`;
  }
  return `${monthFmt(monday)} ${dayOrd(monday.getDate())} – ${monthFmt(sunday)} ${dayOrd(sunday.getDate())}`;
}

function getWeekKey(monday: Date): string {
  return monday.toISOString().split('T')[0];
}

function isCurrentWeek(monday: Date): boolean {
  const now = new Date();
  const currentMonday = getWeekStart(now.toISOString().split('T')[0]);
  return getWeekKey(monday) === getWeekKey(currentMonday);
}

interface WeekGroup {
  key: string;
  label: string;
  monday: Date;
  sunday: Date;
  trips: WorkTracker[];
  totalPay: number;
  isCurrent: boolean;
}

export default function CompletedTripsScreen() {
  const [selectedTrip, setSelectedTrip] = useState<WorkTracker | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});

  const workTrackers = useWorkTrackers().workTrackers;
  const completedTrips = workTrackers ? workTrackers.filter(t => t.status === 'completed') : [];

  // Group trips into work weeks (Mon–Sun)
  const weekGroups = useMemo<WeekGroup[]>(() => {
    const groups: Record<string, WeekGroup> = {};

    completedTrips.forEach(trip => {
      if (!trip.date) return;
      const monday = getWeekStart(trip.date);
      const key = getWeekKey(monday);

      if (!groups[key]) {
        const sunday = getWeekEnd(monday);
        groups[key] = {
          key,
          label: formatWeekRange(monday, sunday),
          monday,
          sunday,
          trips: [],
          totalPay: 0,
          isCurrent: isCurrentWeek(monday),
        };
      }

      groups[key].trips.push(trip);
      groups[key].totalPay += trip.pay_cents ?? 0;
    });

    // Sort weeks newest first, trips within each week newest first
    return Object.values(groups)
      .sort((a, b) => b.monday.getTime() - a.monday.getTime())
      .map(g => ({
        ...g,
        trips: [...g.trips].sort((a, b) => {
          if (!a.date || !b.date) return 0;
          return b.date.localeCompare(a.date);
        }),
      }));
  }, [completedTrips]);

  // By default collapse all weeks except current
  const isCollapsed = (key: string, isCurrent: boolean) => {
    if (key in collapsedWeeks) return collapsedWeeks[key];
    return !isCurrent;
  };

  const toggleWeek = (key: string, isCurrent: boolean) => {
    setCollapsedWeeks(prev => ({
      ...prev,
      [key]: !isCollapsed(key, isCurrent),
    }));
  };

  const allAddressIds = useMemo(() => {
    const ids: (string | null)[] = [];
    completedTrips.forEach(trip => {
      ids.push(trip.pickup_address_uuid);
      ids.push(trip.dropoff_address_uuid);
    });
    return ids;
  }, [completedTrips]);

  const allAddresses = useBatchAddresses(allAddressIds);
  const allBleachers = useBatchBleachers(completedTrips.map(t => t.bleacher_uuid));

  const formatPay = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const formatDate = (dateISO?: string | null) => {
    if (!dateISO) return 'Date not set';
    try {
      const d = new Date(dateISO + 'T00:00:00');
      const day = d.getDate();
      const s = ['th', 'st', 'nd', 'rd'];
      const v = day % 100;
      const ord = s[(v - 20) % 10] || s[v] || s[0];
      const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
      const month = d.toLocaleDateString(undefined, { month: 'short' });
      return `${weekday}, ${month} ${day}${ord}`;
    } catch {
      return 'Invalid date';
    }
  };

  const formatDateTime = (dateISO?: string | null) => {
    if (!dateISO) return '';
    try {
      if (dateISO.length === 10 && dateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateISO.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleString();
      }
      return new Date(dateISO).toLocaleString();
    } catch {
      return dateISO ?? '';
    }
  };

  if (selectedTrip) {
    return <CompletedTrips workTracker={selectedTrip} onClose={() => setSelectedTrip(null)} />;
  }

  const logo = require('../../assets/images/adaptive-icon.png');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BLUE }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Image source={logo} style={{ width: 45, height: 45 }} />
        <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: 0.3, color: '#111827', position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>
          Completed Trips
        </Text>
        <View style={{ width: 45, height: 45 }} />
      </View>

      <ProfileCompletionBanner />

      <FlatList
        contentContainerStyle={{ paddingBottom: 50, paddingTop: 12, paddingHorizontal: 16 }}
        data={weekGroups}
        keyExtractor={item => item.key}
        ListEmptyComponent={() => (
          <View style={{ padding: 16, alignItems: 'center', marginTop: 24 }}>
            <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center' }}>
              Completed trips will appear here once you finish your deliveries.
            </Text>
          </View>
        )}
        renderItem={({ item: group }) => {
          const collapsed = isCollapsed(group.key, group.isCurrent);

          return (
            <View style={{ marginBottom: 12 }}>
              {/* Week header — collapsible */}
              <TouchableOpacity
                onPress={() => toggleWeek(group.key, group.isCurrent)}
                style={{
                  backgroundColor: group.isCurrent ? LIGHT_BLUE : '#1a3d5c',
                  borderRadius: collapsed ? 12 : 12,
                  borderBottomLeftRadius: collapsed ? 12 : 0,
                  borderBottomRightRadius: collapsed ? 12 : 0,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 }}>
                    {group.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#93c5fd' }}>
                    {group.trips.length} {group.trips.length === 1 ? 'trip' : 'trips'}
                    {group.totalPay > 0 ? `  ·  ${formatPay(group.totalPay)}` : ''}
                  </Text>
                </View>
                {group.isCurrent && (
                  <View style={{ backgroundColor: '#34C759', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, marginRight: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.4 }}>THIS WEEK</Text>
                  </View>
                )}
                <Ionicons
                  name={collapsed ? 'chevron-down' : 'chevron-up'}
                  size={18}
                  color="#93c5fd"
                />
              </TouchableOpacity>

              {/* Trip cards */}
              {!collapsed && (
                <View style={{
                  backgroundColor: '#f0f4f8',
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 12,
                  overflow: 'hidden',
                  paddingTop: 2,
                }}>
                  {group.trips.map((trip, index) => {
                    const pickupAddress = trip.pickup_address_uuid ? allAddresses[trip.pickup_address_uuid] : null;
                    const dropoffAddress = trip.dropoff_address_uuid ? allAddresses[trip.dropoff_address_uuid] : null;
                    const bleacher = trip.bleacher_uuid ? allBleachers[trip.bleacher_uuid] : null;
                    const isLast = index === group.trips.length - 1;

                    return (
                      <TouchableOpacity
                        key={trip.id}
                        onPress={() => setSelectedTrip(trip)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          marginHorizontal: 10,
                          marginTop: 8,
                          marginBottom: isLast ? 10 : 0,
                          borderRadius: 10,
                          padding: 14,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.08,
                          shadowRadius: 3,
                          elevation: 2,
                        }}
                      >
                        {/* Trip header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 17, fontWeight: '700', color: '#000', marginBottom: 2 }}>
                              {bleacher ? `Bleacher #${bleacher.bleacher_number}` : 'Trip'}
                              {bleacher && trip.pay_cents ? ' – ' : ''}
                              {trip.pay_cents ? formatPay(trip.pay_cents) : ''}
                            </Text>
                            <Text style={{ fontSize: 13, color: '#8E8E93' }}>
                              {formatDate(trip.date)}
                            </Text>
                          </View>
                        </View>

                        {/* Addresses */}
                        <View style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <Ionicons name="location-outline" size={13} color="#8E8E93" />
                            <Text style={{ fontSize: 11, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Pickup</Text>
                          </View>
                          <Text style={{ fontSize: 13, color: '#111', marginBottom: 8, marginLeft: 18 }}>
                            {pickupAddress ? pickupAddress.street : 'No address'}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <Ionicons name="location-outline" size={13} color="#8E8E93" />
                            <Text style={{ fontSize: 11, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Dropoff</Text>
                          </View>
                          <Text style={{ fontSize: 13, color: '#111', marginLeft: 18 }}>
                            {dropoffAddress ? dropoffAddress.street : 'No address'}
                          </Text>
                        </View>

                        {/* View details */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: '#F2F2F7', paddingTop: 10 }}>
                          <Text style={{ fontSize: 13, color: '#0A84FF', fontWeight: '600' }}>
                            View full details and inspections
                          </Text>
                          <Ionicons name="arrow-forward" size={14} color="#0A84FF" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}