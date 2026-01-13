import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EnrichedWorkTracker } from '@/db/workTrackers';
import { supabase } from '@/library/supabase/supabaseClient';

const DARK_BLUE = "#10365A";
const LIGHT_BLUE = "#1D62A3";

interface CompletedTripProps {
  workTracker: EnrichedWorkTracker;
  onClose: () => void;
}

interface Inspection {
  inspection_id: string;
  walk_around_complete: number;
  issues_found: number;
  issue_description: string | null;
  optional_photo_ids: string | null;
  created_at: string;
}

export default function CompletedTrips({ workTracker, onClose }: CompletedTripProps) {
  const [preInspection, setPreInspection] = useState<Inspection | null>(null);
  const [postInspection, setPostInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInspections();
  }, []);

  const loadInspections = async () => {
    try {
      // Load pre-inspection (pickup)
      if (workTracker.pre_inspection_id) {
        const { data, error } = await supabase
          .from('WorkTrackerInspections')
          .select('*')
          .eq('inspection_id', workTracker.pre_inspection_id)
          .single();

        if (!error && data) {
          setPreInspection(data);
        }
      }

      // Load post-inspection (dropoff)
      if (workTracker.post_inspection_id) {
        const { data, error } = await supabase
          .from('WorkTrackerInspections')
          .select('*')
          .eq('inspection_id', workTracker.post_inspection_id)
          .single();

        if (!error && data) {
          setPostInspection(data);
        }
      }
    } catch (error) {
      console.error('Error loading inspections:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: typeof workTracker.pickup_address) => {
    if (!address) return 'Address not set';
    return `${address.street}, ${address.city}, ${address.state_province}`;
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

  const formatDateTime = (dateISO: string) => {
    try {
      const d = new Date(dateISO);
      return d.toLocaleString();
    } catch (error) {
      return dateISO;
    }
  };

  const openInMaps = async (address?: string) => {
    if (!address) return;
    const q = encodeURIComponent(address);

    const appleUrl = `http://maps.apple.com/?q=${q}`;
    const googleUrlWeb = `https://www.google.com/maps/search/?api=1&query=${q}`;

    if (Platform.OS === "ios") {
      Linking.openURL(appleUrl);
    } else {
      Linking.openURL(googleUrlWeb);
    }
  };

  const renderInspection = (inspection: Inspection | null, title: string) => {
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

        {inspection.optional_photo_ids && (
          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>
              Photos ({inspection.optional_photo_ids.split(',').length})
            </Text>
            <Text style={styles.photoNote}>Photo paths stored in database</Text>
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
              {workTracker.bleacher && `Bleacher #${workTracker.bleacher.bleacher_number}`}
              {workTracker.bleacher && workTracker.pay_cents && ' - '}
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
              <Text style={styles.timelineValue}>{formatDateTime(workTracker.accepted_at)}</Text>
            </View>
          )}
          
          {workTracker.started_at && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Started:</Text>
              <Text style={styles.timelineValue}>{formatDateTime(workTracker.started_at)}</Text>
            </View>
          )}
          
          {workTracker.completed_at && (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Completed:</Text>
              <Text style={styles.timelineValue}>{formatDateTime(workTracker.completed_at)}</Text>
            </View>
          )}
        </View>

        {/* Pickup Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Pickup Location</Text>
          <TouchableOpacity onPress={() => openInMaps(formatAddress(workTracker.pickup_address))}>
            <Text style={styles.addressText}>{formatAddress(workTracker.pickup_address)}</Text>
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
          <TouchableOpacity onPress={() => openInMaps(formatAddress(workTracker.dropoff_address))}>
            <Text style={styles.addressText}>{formatAddress(workTracker.dropoff_address)}</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 4,
  },
  dateText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },
  completedBadge: {
    backgroundColor: '#8E8E93',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  completedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  notesBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 16,
    color: '#000',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  timelineValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  addressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A84FF',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  inspectionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  inspectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  inspectionTime: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
  },
  inspectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  inspectionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  inspectionValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  issueBox: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  issueLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 6,
  },
  issueText: {
    fontSize: 14,
    color: '#856404',
  },
  photoSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  photoLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  photoNote: {
    fontSize: 13,
    color: '#8E8E93',
  },
  noDataText: {
    fontSize: 14,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  closeButton: {
    backgroundColor: '#0A84FF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});