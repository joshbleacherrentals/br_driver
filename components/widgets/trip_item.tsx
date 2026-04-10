import { useAddress } from '@/hooks/db/useAddress';
import { useBleacher } from '@/hooks/db/useBleacher';
import { WorkTracker } from '@/hooks/db/useWorkTrackers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BillOfLading, { BOLButton } from "./billOfLading";

interface TripItemProps {
  workTracker: WorkTracker;
  onAccept?: (workTrackerId: string) => void;
  onStartTrip?: (workTrackerId: string) => void;
  onSkip?: (workTrackerId: string) => void;
  onArrived?: (workTrackerId: string) => void;
  onStartInspection?: (workTrackerId: string, inspectionType: 'pickup' | 'dropoff') => void;
}

export default function TripItem({ workTracker, onAccept, onStartTrip, onSkip, onArrived, onStartInspection }: TripItemProps) {
  const { status, pickup_address_uuid, dropoff_address_uuid, date, pickup_time, dropoff_time, pickup_poc, dropoff_poc, bleacher_uuid, pay_cents, notes, teardown_required, pickup_instructions, setup_required, dropoff_instructions } = workTracker;
  const [bolVisible, setBolVisible] = React.useState(false);

  const pickupAddressData = useAddress(pickup_address_uuid);
  const dropoffAddressData = useAddress(dropoff_address_uuid);
  const { bleacher } = useBleacher(bleacher_uuid);

  // Don't render draft items
  if (status === 'draft' || status === 'completed') {
    return null;
  }

  if (!bleacher) {
    return null;
  }

  const formatAddress = (addressType: 'pickup' | 'dropoff') => {
    const address = addressType === 'pickup' ? pickupAddressData.address : dropoffAddressData.address;
    if (!address) return 'Address not set';

    // return `${address.street}, ${address.city}, ${address.state_province}`;
    return `${address.street}`
  };

  const formatPay = (cents: number | null) => {
    if (cents === null) return '';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time;
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

  const openInMaps = async (address?: string) => {
    if (!address) return;
    const q = encodeURIComponent(address);

    const allOptions = [
      {
        label: 'Apple Maps',
        url: `maps://?q=${q}`,
        fallbackUrl: `http://maps.apple.com/?q=${q}`,
        iosOnly: true,
      },
      {
        label: 'Google Maps',
        url: Platform.OS === 'ios' ? `comgooglemaps://?q=${q}` : `geo:0,0?q=${q}`,
        fallbackUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
        iosOnly: false,
      },
      {
        label: 'Waze',
        url: `waze://?q=${q}&navigate=false`,
        fallbackUrl: `https://waze.com/ul?q=${q}`,
        iosOnly: false,
      },
    ];

    const visibleOptions = allOptions.filter((o) => !o.iosOnly || Platform.OS === 'ios');

    Alert.alert(
      'Open in Maps',
      'Choose an app:',
      [
        ...visibleOptions.map((option) => ({
          text: option.label,
          onPress: async () => {
            try {
              const supported = await Linking.canOpenURL(option.url);
              if (supported) {
                await Linking.openURL(option.url);
              } else {
                // App not installed, open web fallback
                await Linking.openURL(option.fallbackUrl);
              }
            } catch (error) {
              console.error('Error opening maps:', error);
              Alert.alert('Error', 'Could not open maps');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const getStatusBadge = () => {
    switch (status) {
        case 'released':
            return { text: 'PENDING ACCEPTANCE', color: '#34C759' };
        case 'accepted':
            return { text: 'ACCEPTED', color: '#34C759' };
        case 'dest_pickup':
            return { text: 'EN ROUTE', color: '#FF9500' };
        case 'pickup_inspection':
            return { text: 'EN ROUTE', color: '#FF9500' };
        case 'dest_dropoff':
            return { text: 'EN ROUTE', color: '#FF9500' };
        case 'dropoff_inspection':
            return { text: 'EN ROUTE', color: '#FF9500' };
        case 'completed':
            return { text: 'COMPLETED', color: '#8E8E93' };
        case 'cancelled':
            return { text: 'CANCELLED', color: '#FF3B30' };
        default:
            return null;
    }
  };

  const badge = getStatusBadge();

  // Only render flags/instructions when they require driver action
  const showTeardown = teardown_required === 1;
  const showSetup = setup_required === 1;

  return (
    <View style={styles.card}>
      {/* Top Header: Bleacher & Pay */}
      <View style={styles.topHeaderRow}>
        <View style={styles.topHeader}>
          <Text style={styles.mainTitle}>
            {bleacher_uuid && `Bleacher #${bleacher.bleacher_number}`}
            {bleacher && pay_cents !== null && ' - '}
            {pay_cents !== null && formatPay(pay_cents)}
          </Text>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
        </View>
        {badge && (
          <View style={styles.badgeAndBol}>
            <View style={[styles.statusBadge, { backgroundColor: badge.color }]}>
              <Text style={styles.statusText}>{badge.text}</Text>
            </View>
            <BOLButton onPress={() => setBolVisible(true)} />
          </View>
        )}
      </View>

      {/* Notes — only if present */}
      {!!notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      )}

      <View style={styles.divider} />

      {/* PICKUP */}
      <View style={styles.stopSection}>
        <View style={styles.stopHeader}>
          <View style={styles.stopHeaderLeft}>
            <Ionicons name="location" size={16} color="#000" />
            <Text style={styles.locationLabel}>PICKUP</Text>
          </View>
          {pickup_time && (
            <Text style={styles.timeText}>{formatTime(pickup_time)}</Text>
          )}
        </View>

        <TouchableOpacity 
          onPress={() => {
            const addr = pickupAddressData.address;
            openInMaps(addr ? `${addr.street}, ${addr.city}, ${addr.state_province}, ${addr.zip_postal}` : undefined);
          }} 
          activeOpacity={0.7}
        >
          <Text style={styles.addressText}>{formatAddress('pickup')}</Text>
        </TouchableOpacity>
        {!!pickup_poc && <Text style={styles.detailText}>POC: {pickup_poc}</Text>}

        {/* Only shown when tear-down is required */}
        {showTeardown && (
          <View style={styles.flagRow}>
            <Ionicons name="construct-outline" size={14} color="#FF9500" />
            <Text style={[styles.flagText, styles.flagTextActive]}>Tear Down Required</Text>
          </View>
        )}

        {/* Only shown when instructions exist */}
        {!!pickup_instructions && (
          <View style={styles.instructionsBox}>
            <Text style={styles.instructionsLabel}>Pickup Instructions</Text>
            <Text style={styles.instructionsText}>{pickup_instructions}</Text>
          </View>
        )}
      </View>

      {status === 'dest_pickup' && (
        <View style={styles.buttonRow}>
            {/* <TouchableOpacity
                style={styles.skipButton}
                onPress={() => onSkip?.(workTracker.id)}
            >
                <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity> */}
            <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => onArrived?.(workTracker.id)}
            >
                <Text style={styles.primaryButtonText}>I've Arrived</Text>
            </TouchableOpacity>
        </View>
      )}

      {status === 'pickup_inspection' && (
        <TouchableOpacity
          style={styles.inspectionButton}
          onPress={() => onStartInspection?.(workTracker.id, 'pickup')}
        >
          <Text style={styles.inspectionButtonText}>Start Pickup Inspection</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      {/* DROP-OFF */}
      <View style={styles.stopSection}>
        <View style={styles.stopHeader}>
          <View style={styles.stopHeaderLeft}>
            <Ionicons name="location" size={16} color="#000" />
            <Text style={styles.locationLabel}>DROP-OFF</Text>
          </View>
          {dropoff_time && (
            <Text style={styles.timeText}>{formatTime(dropoff_time)}</Text>
          )}
        </View>

        <TouchableOpacity 
          onPress={() => {
            const addr = dropoffAddressData.address;
            openInMaps(addr ? `${addr.street}, ${addr.city}, ${addr.state_province}, ${addr.zip_postal}` : undefined);
          }} 
          activeOpacity={0.7}
        >
          <Text style={styles.addressText}>{formatAddress('dropoff')}</Text>
        </TouchableOpacity>
        {!!dropoff_poc && <Text style={styles.detailText}>POC: {dropoff_poc}</Text>}

        {/* Only shown when set-up is required */}
        {showSetup && (
          <View style={styles.flagRow}>
            <Ionicons name="construct-outline" size={14} color="#FF9500" />
            <Text style={[styles.flagText, styles.flagTextActive]}>Set Up Required</Text>
          </View>
        )}

        {/* Only shown when instructions exist */}
        {!!dropoff_instructions && (
          <View style={styles.instructionsBox}>
            <Text style={styles.instructionsLabel}>Drop-off Instructions</Text>
            <Text style={styles.instructionsText}>{dropoff_instructions}</Text>
          </View>
        )}
      </View>

      {/* Action buttons based on status */}
      {status === 'released' && (
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => onAccept?.(workTracker.id)}
        >
          <Text style={styles.acceptButtonText}>Accept Trip</Text>
        </TouchableOpacity>
      )}

      {status === 'accepted' && (
        <View style={styles.buttonRow}>
          {/* <TouchableOpacity
            style={styles.skipButton}
            onPress={() => onSkip?.(workTracker.id)}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity> */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onStartTrip?.(workTracker.id)}
          >
            <Text style={styles.primaryButtonText}>Start Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'dropoff_inspection' && (
        <TouchableOpacity
          style={styles.inspectionButton}
          onPress={() => onStartInspection?.(workTracker.id, 'dropoff')}
        >
          <Text style={styles.inspectionButtonText}>Start Dropoff Inspection</Text>
        </TouchableOpacity>
      )}

      {status === 'dest_dropoff' && (
        <View style={styles.buttonRow}>
          {/* <TouchableOpacity
            style={styles.skipButton}
            onPress={() => onSkip?.(workTracker.id)}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity> */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onArrived?.(workTracker.id)}
          >
            <Text style={styles.primaryButtonText}>I've Arrived</Text>
          </TouchableOpacity>
        </View>
      )}

      <BillOfLading
        visible={bolVisible}
        workTracker={workTracker}
        onClose={() => setBolVisible(false)}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  badgeAndBol: { alignItems: 'flex-end', flexShrink: 0 },
  card: {
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
  },
  topHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  topHeader: { flex: 1 },
  mainTitle: { fontSize: 24, fontWeight: '700', color: '#000', marginBottom: 4 },
  dateText: { fontSize: 15, color: '#8E8E93', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginLeft: 12 },
  statusText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  notesBox: { backgroundColor: '#F8F8F8', borderRadius: 8, padding: 12, marginBottom: 12 },
  notesLabel: { fontSize: 12, color: '#888', marginBottom: 4, fontWeight: '500' },
  notesText: { fontSize: 14, color: '#333' },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  stopSection: { marginBottom: 8 },
  stopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stopHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationLabel: { fontSize: 13, fontWeight: '700', color: '#000', letterSpacing: 0.5 },
  timeText: { fontSize: 15, fontWeight: '600', color: '#000' },
  addressText: { fontSize: 15, fontWeight: '600', color: '#0A84FF', marginBottom: 4 },
  detailText: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  flagText: { fontSize: 13, color: '#8E8E93' },
  flagTextActive: { color: '#FF9500', fontWeight: '600' },
  instructionsBox: {
    backgroundColor: '#F0F4FF',
    borderLeftWidth: 3,
    borderLeftColor: '#1D62A3',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  instructionsLabel: { fontSize: 11, fontWeight: '700', color: '#1D62A3', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  instructionsText: { fontSize: 13, color: '#1C1C1E', lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  skipButton: { flex: 1, backgroundColor: '#F2F2F7', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  skipButtonText: { fontSize: 15, fontWeight: '600', color: '#000' },
  primaryButton: { flex: 2, backgroundColor: '#0A84FF', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primaryButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  acceptButton: { backgroundColor: '#34C759', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  acceptButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  startButton: { backgroundColor: '#0A84FF', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  startButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  arrivedButton: { backgroundColor: '#0A84FF', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  arrivedButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  inspectionButton: { backgroundColor: '#FF9500', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  inspectionButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});