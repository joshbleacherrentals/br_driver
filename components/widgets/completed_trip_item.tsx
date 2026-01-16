import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WorkTracker } from '@/db/workTrackers';
import { fetchAddreses } from '@/db/fetchAddress';
import { fetchInspection } from '@/db/fetchInspection';
import { fetchBleacher } from '@/db/fetchBleacher';

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

interface CompletedTripProps {
  workTracker: WorkTracker;
  onClose: () => void;
}

export default function CompletedTrips({ workTracker, onClose }: CompletedTripProps) {
  // ✅ Hooks MUST be called unconditionally at top level
  const { address: pickupAddress } = fetchAddreses(workTracker.pickup_address_uuid);
  const { address: dropoffAddress } = fetchAddreses(workTracker.dropoff_address_uuid);
  const { bleacher } = fetchBleacher(workTracker.bleacher_uuid);

  const { inspection: preInspection } = fetchInspection(workTracker.pre_inspection_uuid);
  const { inspection: postInspection } = fetchInspection(workTracker.post_inspection_uuid);

  const formatPay = (cents: number | null) =>
    cents === null ? '' : `$${(cents / 100).toFixed(2)}`;

  const formatTime = (time: string | null) => time ?? '';

  const formatDate = (dateISO?: string | null) => {
    if (!dateISO) return 'Date not set';
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
    } catch {
      return 'Invalid date';
    }
  };

  const formatDateTime = (dateISO?: string | null) => {
    if (!dateISO) return '';
    try {
      return new Date(dateISO).toLocaleString();
    } catch {
      return dateISO ?? '';
    }
  };

  const openInMaps = async (address?: string) => {
    if (!address) return;
    const q = encodeURIComponent(address);
    const appleUrl = `http://maps.apple.com/?q=${q}`;
    const googleUrlWeb = `https://www.google.com/maps/search/?api=1&query=${q}`;
    Linking.openURL(Platform.OS === "ios" ? appleUrl : googleUrlWeb);
  };

  const renderInspection = (inspection: any | null, title: string) => {
    if (!inspection) {
      return (
        <View style={styles.inspectionSection}>
          <Text style={styles.inspectionTitle}>{title}</Text>
          <Text style={styles.noDataText}>No inspection data available</Text>
        </View>
      );
    }

    return (
      <View style={styles.inspectionSection}>
        <Text style={styles.inspectionTitle}>{title}</Text>
        <Text style={styles.inspectionTime}>
          Completed: {formatDateTime(inspection.created_at)}
        </Text>

        <View style={styles.inspectionItem}>
          <Text style={styles.inspectionLabel}>Walk-around Complete:</Text>
          <Text style={styles.inspectionValue}>
            {inspection.walk_around_complete ? '✓ Yes' : '✗ No'}
          </Text>
        </View>

        <View style={styles.inspectionItem}>
          <Text style={styles.inspectionLabel}>Issues Found:</Text>
          <Text style={styles.inspectionValue}>
            {inspection.issues_found ? '⚠️ Yes' : '✓ No Issues'}
          </Text>
        </View>

        {inspection.issues_found === 1 && inspection.issue_description && (
          <View style={styles.issueBox}>
            <Text style={styles.issueLabel}>Issue Description:</Text>
            <Text style={styles.issueText}>{inspection.issue_description}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Completed Trip</Text>
            <Text style={styles.subtitle}>
              {bleacher && `Bleacher #${bleacher.bleacher_number}`}
              {workTracker.bleacher_uuid && workTracker.pay_cents && ' - '}
              {workTracker.pay_cents && formatPay(workTracker.pay_cents)}
            </Text>
            <Text style={styles.dateText}>{formatDate(workTracker.date)}</Text>
          </View>
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>COMPLETED</Text>
          </View>
        </View>

        {/* Notes */}
        {workTracker.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Trip Notes</Text>
            <Text style={styles.notesText}>{workTracker.notes}</Text>
          </View>
        )}

        {/* Trip Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Timeline</Text>

          {workTracker.accepted_at && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Accepted:</Text>
              <Text style={styles.timelineValue}>
                {formatDateTime(workTracker.accepted_at)}
              </Text>
            </View>
          )}

          {workTracker.started_at && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Started:</Text>
              <Text style={styles.timelineValue}>
                {formatDateTime(workTracker.started_at)}
              </Text>
            </View>
          )}

          {workTracker.completed_at && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Completed:</Text>
              <Text style={styles.timelineValue}>
                {formatDateTime(workTracker.completed_at)}
              </Text>
            </View>
          )}
        </View>

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Pickup Location</Text>
          <TouchableOpacity
            onPress={() =>
              openInMaps(
                pickupAddress
                  ? `${pickupAddress.street}, ${pickupAddress.city}, ${pickupAddress.state_province}, ${pickupAddress.zip_postal}`
                  : undefined
              )
            }
          >
            <Text style={styles.addressText}>
              {pickupAddress
                ? `${pickupAddress.street}, ${pickupAddress.city}, ${pickupAddress.state_province}, ${pickupAddress.zip_postal}`
                : 'Address not set'}
            </Text>
          </TouchableOpacity>
          {workTracker.pickup_time && (
            <Text style={styles.detailText}>Time: {formatTime(workTracker.pickup_time)}</Text>
          )}
          {workTracker.pickup_poc && (
            <Text style={styles.detailText}>POC: {workTracker.pickup_poc}</Text>
          )}
        </View>

        {/* Pickup Inspection */}
        {renderInspection(preInspection, 'Pickup Inspection')}

        {/* Dropoff Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Dropoff Location</Text>
          <TouchableOpacity
            onPress={() =>
              openInMaps(
                dropoffAddress
                  ? `${dropoffAddress.street}, ${dropoffAddress.city}, ${dropoffAddress.state_province}, ${dropoffAddress.zip_postal}`
                  : undefined
              )
            }
          >
            <Text style={styles.addressText}>
              {dropoffAddress
                ? `${dropoffAddress.street}, ${dropoffAddress.city}, ${dropoffAddress.state_province}, ${dropoffAddress.zip_postal}`
                : 'Address not set'}
            </Text>
          </TouchableOpacity>
          {workTracker.dropoff_time && (
            <Text style={styles.detailText}>Time: {formatTime(workTracker.dropoff_time)}</Text>
          )}
          {workTracker.dropoff_poc && (
            <Text style={styles.detailText}>POC: {workTracker.dropoff_poc}</Text>
          )}
        </View>

        {/* Dropoff Inspection */}
        {renderInspection(postInspection, 'Dropoff Inspection')}

        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#000' },
  subtitle: { fontSize: 18, fontWeight: '600', color: '#000', marginTop: 4 },
  dateText: { fontSize: 15, color: '#8E8E93', marginTop: 2 },
  completedBadge: {
    backgroundColor: '#8E8E93',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  completedText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  notesBox: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  notesLabel: { fontSize: 14, fontWeight: '600', color: '#8E8E93', marginBottom: 8 },
  notesText: { fontSize: 16, color: '#000' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#000', marginBottom: 12 },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  timelineLabel: { fontSize: 14, fontWeight: '500', color: '#8E8E93' },
  timelineValue: { fontSize: 14, fontWeight: '600', color: '#000' },
  addressText: { fontSize: 16, fontWeight: '600', color: '#0A84FF', marginBottom: 8 },
  detailText: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  inspectionSection: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  inspectionTitle: { fontSize: 18, fontWeight: '600', color: '#000', marginBottom: 4 },
  inspectionTime: { fontSize: 13, color: '#8E8E93', marginBottom: 12 },
  inspectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  inspectionLabel: { fontSize: 15, fontWeight: '500', color: '#000' },
  inspectionValue: { fontSize: 15, fontWeight: '600', color: '#000' },
  issueBox: { backgroundColor: '#FFF3CD', borderRadius: 8, padding: 12, marginTop: 12 },
  issueLabel: { fontSize: 14, fontWeight: '600', color: '#856404', marginBottom: 6 },
  issueText: { fontSize: 14, color: '#856404' },
  noDataText: { fontSize: 14, color: '#8E8E93', fontStyle: 'italic' },
  closeButton: {
    backgroundColor: '#0A84FF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  closeButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
