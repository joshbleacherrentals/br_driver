import { db } from '@/components/providers/SystemProvider';
import CompletedTrips from "@/components/widgets/completed_trip_item";
import InspectionScreen from "@/components/widgets/inspection";
import ProfileCompletionBanner from '@/components/widgets/onboardingBanner';
import TripItem from "@/components/widgets/trip_item";
import { useBatchAddresses } from '@/hooks/db/useAddress';
import { useAllBleachers, useBatchBleachers } from '@/hooks/db/useBleacher';
import { useResolvedBleacherAddresses } from '@/hooks/db/useResolveAddress';
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { executeTypedMutationVoid } from '@/library/powersync/typedMutation';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";
const MID_BLUE = "#164d82";

type InspectionType = 'pickup' | 'dropoff';
type ActiveTab = 'upcoming' | 'history';

function getWeekStart(dateISO: string): Date {
  const d = new Date(dateISO + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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
  const currentMonday = getWeekStart(new Date().toISOString().split('T')[0]);
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

const formatPay = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function formatDate(dateISO?: string | null) {
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
}

export default function TripsScreen() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('upcoming');
  const [inspectionData, setInspectionData] = useState<{
    workTrackerId: string;
    type: InspectionType;
  } | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<WorkTracker | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});

  const workTrackers = useWorkTrackers().workTrackers;
  const { isProfileComplete } = useProfileCompletion();

  const { bleachers: allBleachersFleet } = useAllBleachers();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── Resolve addresses for all bleachers at the top level (not inside useMemo) ──
  const resolvedAddresses = useResolvedBleacherAddresses(allBleachersFleet, today);
  console.log('[resolvedAddresses]', JSON.stringify(resolvedAddresses, null, 2));

  const bleacherOptions = useMemo(
    () =>
      allBleachersFleet
        .map((b) => ({
          uuid: b.id,
          bleacher_number: b.bleacher_number ?? '—',
          bleacher_rows: b.bleacher_rows ?? null,
          resolved_address: resolvedAddresses[b.id] ?? null,
          label: b.bleacher_rows ? `${b.bleacher_rows} rows` : undefined,
        }))
        .sort((a, b) => parseInt(String(a.bleacher_number)) - parseInt(String(b.bleacher_number))),
    [allBleachersFleet, resolvedAddresses]
  );

  const logo = require('../../assets/images/adaptive-icon.png');

  const completedTrips = useMemo(
    () => (workTrackers ?? []).filter(t => t.status === 'completed'),
    [workTrackers]
  );

  const weekGroups = useMemo<WeekGroup[]>(() => {
    const groups: Record<string, WeekGroup> = {};
    completedTrips.forEach(trip => {
      if (!trip.date) return;
      const monday = getWeekStart(trip.date);
      const key = getWeekKey(monday);
      if (!groups[key]) {
        const sunday = getWeekEnd(monday);
        groups[key] = {
          key, label: formatWeekRange(monday, sunday),
          monday, sunday, trips: [], totalPay: 0,
          isCurrent: isCurrentWeek(monday),
        };
      }
      groups[key].trips.push(trip);
      groups[key].totalPay += trip.pay_cents ?? 0;
    });
    return Object.values(groups)
      .sort((a, b) => b.monday.getTime() - a.monday.getTime())
      .map(g => ({
        ...g,
        trips: [...g.trips].sort((a, b) =>
          (b.date ?? '').localeCompare(a.date ?? '')
        ),
      }));
  }, [completedTrips]);

  const isCollapsed = (key: string, isCurrent: boolean) => {
    if (key in collapsedWeeks) return collapsedWeeks[key];
    return !isCurrent;
  };

  const toggleWeek = (key: string, isCurrent: boolean) => {
    setCollapsedWeeks(prev => ({ ...prev, [key]: !isCollapsed(key, isCurrent) }));
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

  const handleAccept = async (workTrackerId: string) => {
    if (!isProfileComplete) {
      Alert.alert("Error", "Complete your profile before you can accept any trips");
      return;
    }
    try {
      const now = new Date().toISOString();
      await executeTypedMutationVoid(
        db.updateTable('WorkTrackers')
          .set({ status: 'accepted', accepted_at: now, updated_at: now })
          .where('id', '=', workTrackerId)
          .compile()
      );
    } catch {
      Alert.alert("Error", "Failed to accept trip.");
    }
  };

  const handleStartTrip = async (workTrackerId: string) => {
    Alert.alert("Start Trip", "Ready to start this trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start",
        onPress: async () => {
          try {
            const now = new Date().toISOString();
            await executeTypedMutationVoid(
              db.updateTable('WorkTrackers')
                .set({ status: 'dest_pickup', started_at: now, updated_at: now })
                .where('id', '=', workTrackerId)
                .compile()
            );
          } catch {
            Alert.alert("Error", "Failed to start trip. Please try again.");
          }
        },
      },
    ]);
  };

  const handleArrived = async (workTrackerId: string, arrivedAt: string) => {
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
              await executeTypedMutationVoid(
                db.updateTable('WorkTrackers')
                  .set({ status: newStatus, updated_at: new Date().toISOString() })
                  .where('id', '=', workTrackerId)
                  .compile()
              );
            } catch {
              Alert.alert("Error", "Failed to update inspection status. Please try again.");
            }
          },
        },
      ]
    );
  };

  const [pendingBleacherUuids, setPendingBleacherUuids] = React.useState<Record<string, string>>({});

  const handleBleacherChange = (workTrackerId: string, newBleacherUuid: string) => {
    setPendingBleacherUuids(prev => ({ ...prev, [workTrackerId]: newBleacherUuid }));
  };

  const handleStartInspection = async (
    workTrackerId: string,
    type: 'pickup' | 'dropoff',
    arrivedAt: string | null,
  ) => {
    const pendingUuid = pendingBleacherUuids[workTrackerId];
    if (pendingUuid) {
      try {
        await executeTypedMutationVoid(
          db.updateTable('WorkTrackers')
            .set({ bleacher_uuid: pendingUuid, updated_at: new Date().toISOString() })
            .where('id', '=', workTrackerId)
            .compile()
        );
      } catch {
        Alert.alert("Error", "Failed to save bleacher selection. Please try again.");
        return;
      }
    }
    setInspectionData({ workTrackerId, type });
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
              await executeTypedMutationVoid(
                db.updateTable('WorkTrackers')
                  .set({ status: 'cancelled', updated_at: new Date().toISOString() })
                  .where('id', '=', workTrackerId)
                  .compile()
              );
            } catch {
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
      const fields = newStatus === 'completed'
        ? { status: newStatus, completed_at: now, updated_at: now }
        : { status: newStatus, updated_at: now };
      await executeTypedMutationVoid(
        db.updateTable('WorkTrackers').set(fields).where('id', '=', workTrackerId).compile()
      );
    } catch {
      Alert.alert("Error", "Failed to complete inspection. Please try again.");
    }
  };

  if (inspectionData) {
    return (
      <InspectionScreen
        workTrackerId={inspectionData.workTrackerId}
        inspectionType={inspectionData.type}
        onComplete={() => { void handleInspectionComplete(inspectionData.workTrackerId); }}
        onCancel={() => setInspectionData(null)}
      />
    );
  }

  if (selectedTrip) {
    return (
      <CompletedTrips
        workTracker={selectedTrip}
        onClose={() => setSelectedTrip(null)}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BLUE }}>

      {/* Header */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
        backgroundColor: '#FFFFFF', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Image source={logo} style={{ width: 45, height: 45 }} />
        <Text style={{
          fontSize: 24, fontWeight: '700', letterSpacing: 0.3,
          color: '#111827', position: 'absolute', left: 0, right: 0, textAlign: 'center',
        }}>
          Trips
        </Text>
        <View style={{ width: 45, height: 45 }} />
      </View>

      <ProfileCompletionBanner />

      {/* Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'upcoming' && styles.toggleBtnActive]}
          onPress={() => setActiveTab('upcoming')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="truck"
            size={14}
            color={activeTab === 'upcoming' ? '#fff' : '#93c5fd'}
          />
          <Text style={[styles.toggleText, activeTab === 'upcoming' && styles.toggleTextActive]}>
            Upcoming
          </Text>
          {(workTrackers ?? []).filter(t => t.status !== 'completed' && t.status !== 'cancelled').length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(workTrackers ?? []).filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'draft').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'history' && styles.toggleBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={activeTab === 'history' ? '#fff' : '#93c5fd'}
          />
          <Text style={[styles.toggleText, activeTab === 'history' && styles.toggleTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Upcoming Trips ── */}
      {activeTab === 'upcoming' && (
        <FlatList
          contentContainerStyle={{ paddingBottom: 50, paddingTop: 8 }}
          data={workTrackers?.filter(t => t.status !== 'completed')}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TripItem
              workTracker={item}
              bleacherOptions={bleacherOptions}
              onAccept={handleAccept}
              onStartTrip={handleStartTrip}
              onSkip={handleSkip}
              onArrived={handleArrived}
              onStartInspection={handleStartInspection}
              onBleacherChange={handleBleacherChange}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={() => (
            <View style={{ padding: 16 }}>
              <Text style={{ color: '#93c5fd' }}>No upcoming trips.</Text>
            </View>
          )}
        />
      )}

      {/* ── Trip History ── */}
      {activeTab === 'history' && (
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
                <TouchableOpacity
                  onPress={() => toggleWeek(group.key, group.isCurrent)}
                  style={{
                    backgroundColor: group.isCurrent ? LIGHT_BLUE : '#1a3d5c',
                    borderRadius: collapsed ? 12 : 12,
                    borderBottomLeftRadius: collapsed ? 12 : 0,
                    borderBottomRightRadius: collapsed ? 12 : 0,
                    paddingVertical: 12, paddingHorizontal: 14,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
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
                  <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color="#93c5fd" />
                </TouchableOpacity>

                {!collapsed && (
                  <View style={{
                    backgroundColor: '#f0f4f8', borderBottomLeftRadius: 12,
                    borderBottomRightRadius: 12, overflow: 'hidden', paddingTop: 2,
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
                            marginHorizontal: 10, marginTop: 8,
                            marginBottom: isLast ? 10 : 0,
                            borderRadius: 10, padding: 14,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 17, fontWeight: '700', color: '#000', marginBottom: 2 }}>
                                {bleacher ? `Bleacher #${bleacher.bleacher_number}` : 'Trip'}
                                {bleacher && trip.pay_cents ? ' – ' : ''}
                                {trip.pay_cents ? formatPay(trip.pay_cents) : ''}
                              </Text>
                              <Text style={{ fontSize: 13, color: '#8E8E93' }}>{formatDate(trip.date)}</Text>
                            </View>
                          </View>
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: '#F2F2F7', paddingTop: 10 }}>
                            <Text style={{ fontSize: 13, color: '#0A84FF', fontWeight: '600' }}>View full details and inspections</Text>
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: MID_BLUE,
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: LIGHT_BLUE,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#93c5fd',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  badge: {
    backgroundColor: '#004281',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});