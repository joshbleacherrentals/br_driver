import { inspectionPhotoAttachmentQueue } from '@/components/providers/SystemProvider';
import { useAddress } from '@/hooks/db/useAddress';
import { useBleacher } from '@/hooks/db/useBleacher';
import { InspectionPhotosData, useInspection, useInspectionPhotos } from '@/hooks/db/useInspection';
import { WorkTracker } from '@/hooks/db/useWorkTrackers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

interface CompletedTripProps {
  workTracker: WorkTracker;
  onClose: () => void;
}

/**
 * Resolve a local URI for an existing inspection photo attachment path.
 * The attachment queue stores files at: {documentDirectory}/attachments/{filename}
 */
function getLocalUriForAttachment(attachmentId: string): string | null {
  if (!attachmentId) return null;
  if (!inspectionPhotoAttachmentQueue) return null;

  const localPath = inspectionPhotoAttachmentQueue.getLocalFilePathSuffix(attachmentId);
  return inspectionPhotoAttachmentQueue.getLocalUri(localPath);
}

export default function CompletedTrips({ workTracker, onClose }: CompletedTripProps) {
  // ✅ Hooks MUST be called unconditionally at top level
  const { address: pickupAddress } = useAddress(workTracker.pickup_address_uuid);
  const { address: dropoffAddress } = useAddress(workTracker.dropoff_address_uuid);
  const { bleacher } = useBleacher(workTracker.bleacher_uuid);

  const { inspection: preInspection } = useInspection(workTracker.pre_inspection_uuid);
  const { Photos: preInspectPhotos } = useInspectionPhotos(workTracker.pre_inspection_uuid);
  const { inspection: postInspection } = useInspection(workTracker.post_inspection_uuid);
  const { Photos: postInspectPhotos } = useInspectionPhotos(workTracker.post_inspection_uuid);

  const formatPay = (cents: number | null) =>
    cents === null ? '' : `$${(cents / 100).toFixed(2)}`;

  const formatTime = (time: string | null) => time ?? '';

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

  const renderInspection = (
    inspection: any | null,
    title: string,
    photos: InspectionPhotosData[] | null
  ) => {
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
          <View style={styles.inspectionValueContainer}>
            {inspection.walk_around_complete ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                <Text style={[styles.inspectionValue, { marginLeft: 6 }]}>Yes</Text>
              </>
            ) : (
              <>
                <Ionicons name="close-circle" size={18} color="#FF3B30" />
                <Text style={[styles.inspectionValue, { marginLeft: 6 }]}>No</Text>
              </>
            )}
          </View>
        </View>

        {/* <View style={styles.inspectionItem}>
          <Text style={styles.inspectionLabel}>Issues Found:</Text>
          <View style={styles.inspectionValueContainer}>
            {inspection.issues_found ? (
              <>
                <Ionicons name="warning" size={18} color="#FF9500" />
                <Text style={[styles.inspectionValue, { marginLeft: 6 }]}>Yes</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                <Text style={[styles.inspectionValue, { marginLeft: 6 }]}>None</Text>
              </>
            )}
          </View>
        </View>

        {inspection.issues_found === 1 && inspection.issue_description && (
          <View style={styles.issueBox}>
            <Text style={styles.issueLabel}>Issue Description:</Text>
            <Text style={styles.issueText}>{inspection.issue_description}</Text>
          </View>
        )}

        {/* Photos *
        {photos?.map(photo => {
          console.log(photo.storage_path)
          if (!photo.storage_path) return null;

          const uri = getLocalUriForAttachment(photo.storage_path);
          if (!uri) return null;

          return (
            <View key={photo.id} style={styles.photoContainer}>
              <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
              {photo.caption && (
                <Text style={styles.photoCaption}>{photo.caption}</Text>
              )}
            </View>
          );
        })} */}
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
          <View style={styles.sectionTitleRow}>
            <Ionicons name="location" size={20} color="#000" />
            <Text style={styles.sectionTitle}>Pickup Location</Text>
          </View>
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
                ? `${pickupAddress.street}`
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
        {renderInspection(preInspection, 'Pickup Inspection', preInspectPhotos)}

        {/* Dropoff Location */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="location" size={20} color="#000" />
            <Text style={styles.sectionTitle}>Dropoff Location</Text>
          </View>
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
                ? `${dropoffAddress.street}`
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
        {renderInspection(postInspection, 'Dropoff Inspection', postInspectPhotos)}

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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#000', marginBottom: 0 },
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
  inspectionValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  photosContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  photosTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoContainer: {
    width: 100,
    height: 100,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  photoCaption: {
    fontSize: 11,
    marginTop: 4,
    color: '#8E8E93',
    textAlign: 'center',
  },
});