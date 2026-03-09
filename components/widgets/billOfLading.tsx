import { useAddress } from '@/hooks/db/useAddress';
import { useBleacher } from '@/hooks/db/useBleacher';
import { WorkTracker } from '@/hooks/db/useWorkTrackers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Brand colours (matches your existing components) ────────────────────────
const DARK_BLUE = '#10365A';
const LIGHT_BLUE = '#1D62A3';
const ACCENT = '#0A84FF';
const SURFACE = '#FFFFFF';
const BG = '#F2F2F7';
const MUTED = '#8E8E93';
const DIVIDER = '#E5E7EB';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BillOfLadingProps {
  visible: boolean;
  workTracker: WorkTracker;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateISO?: string | null): string {
  if (!dateISO) return '—';
  try {
    const d = new Date(dateISO + 'T00:00:00');
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateISO;
  }
}

function boolLabel(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return val ? 'Yes' : 'No';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal key/value row */
function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value?: string | number | null;
  accent?: boolean;
}) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={[infoRowStyles.value, accent && infoRowStyles.accentValue]}>
        {value !== null && value !== undefined && value !== '' ? String(value) : '—'}
      </Text>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    flex: 1,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1.4,
    textAlign: 'right',
  },
  accentValue: {
    color: ACCENT,
  },
});

/** Section card wrapper */
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.card}>
      <View style={sectionStyles.titleRow}>
        {icon && (
          <Ionicons
            name={icon as any}
            size={16}
            color={DARK_BLUE}
            style={{ marginRight: 6 }}
          />
        )}
        <Text style={sectionStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: DARK_BLUE,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: DARK_BLUE,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BillOfLading({
  visible,
  workTracker,
  onClose,
}: BillOfLadingProps) {
  const { address: pickupAddress } = useAddress(workTracker.pickup_address_uuid);
  const { address: dropoffAddress } = useAddress(workTracker.dropoff_address_uuid);
  const { bleacher } = useBleacher(workTracker.bleacher_uuid);

  const pickupFull = pickupAddress
    ? `${pickupAddress.street}, ${pickupAddress.city}, ${pickupAddress.state_province} ${pickupAddress.zip_postal}`
    : null;

  const dropoffFull = dropoffAddress
    ? `${dropoffAddress.street}, ${dropoffAddress.city}, ${dropoffAddress.state_province} ${dropoffAddress.zip_postal}`
    : null;

  const seats =
    bleacher?.bleacher_rows && bleacher?.bleacher_seats
      ? `${bleacher.bleacher_rows} rows / ${bleacher.bleacher_seats} seats`
      : bleacher?.bleacher_seats
      ? `${bleacher.bleacher_seats} seats`
      : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* ── Modal Header ── */}
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalHeaderLabel}>BILL OF LADING</Text>
            {workTracker.project_number && (
              <Text style={styles.modalHeaderSub}>
                Project #{workTracker.project_number}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={SURFACE} />
          </TouchableOpacity>
        </View>

        {/* ── Shipper Banner ── */}
        <View style={styles.shipperBanner}>
          <Text style={styles.shipperName}>Bleacher Rentals Florida LLC</Text>
          <Text style={styles.shipperDetail}>7901 4th St N 25767 · St. Petersburg, FL 33702</Text>
          <Text style={styles.shipperDetail}>(800) 436-0416</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Shipment Details ── */}
          <Section title="Shipment Details" icon="cube-outline">
            <InfoRow label="Item" value="Mobile Bleacher Trailer" />
            <InfoRow label="Unit Number" value={bleacher?.bleacher_number} />
            <InfoRow label="Size / Seats" value={seats} />
            <InfoRow label="VIN" value={bleacher?.vin_number} />
            <InfoRow label="TAG #" value={bleacher?.tag_number} />
            <InfoRow label="Hitch Type" value={bleacher?.hitch_type} />
            <InfoRow label="Manufacturer" value={bleacher?.manufacturer} />
            <InfoRow
              label="GVWR"
              value={bleacher?.gvwr != null ? `${bleacher.gvwr} lbs` : null}
            />
            <InfoRow
              label="Height (Folded)"
              value={
                bleacher?.height_folded_ft != null
                  ? `${bleacher.height_folded_ft} ft`
                  : null
              }
            />
            <View style={[infoRowStyles.row, { borderBottomWidth: 0 }]}>
              <Text style={infoRowStyles.label}>Notes</Text>
              <Text style={[infoRowStyles.value, { color: MUTED }]}>
                Power Only · Flatbed
              </Text>
            </View>
          </Section>

          {/* ── Carrier & Payment ── */}
          <Section title="Carrier & Payment Terms" icon="document-text-outline">
            <Text style={styles.legalText}>
              Carrier liability agreed to a minimum of $100,000.00 cargo or equal to
              load declared value (whichever is greater).
            </Text>
            <Text style={[styles.legalText, { marginTop: 8 }]}>
              Payment is due only upon successful delivery and acceptance by the
              consignee. Any discrepancies or damages must be documented and
              communicated immediately.
            </Text>
          </Section>

          {/* ── Pickup ── */}
          <Section title="Pickup Information" icon="location-outline">
            <InfoRow label="Date" value={formatDate(workTracker.date)} />
            <InfoRow label="Time" value={workTracker.pickup_time} />
            <InfoRow label="Address" value={pickupFull} accent />
            <InfoRow label="On-Site POC" value={workTracker.pickup_poc} />
            <InfoRow
              label="Tear Down Required"
              value={boolLabel(workTracker.teardown_required)}
            />
            <View style={[infoRowStyles.row, { borderBottomWidth: 0, alignItems: 'flex-start' }]}>
              <Text style={infoRowStyles.label}>Pickup Instructions</Text>
              <Text style={[infoRowStyles.value, { color: '#1C1C1E' }]}>
                {workTracker.pickup_instructions || '—'}
              </Text>
            </View>
          </Section>

          {/* ── Delivery ── */}
          <Section title="Delivery Information" icon="flag-outline">
            <InfoRow label="Date" value={formatDate(workTracker.date)} />
            <InfoRow label="Time" value={workTracker.dropoff_time} />
            <InfoRow label="Address" value={dropoffFull} accent />
            <InfoRow label="On-Site POC (Consignee)" value={workTracker.dropoff_poc} />
            <InfoRow
              label="Set Up Required"
              value={boolLabel(workTracker.setup_required)}
            />
            <View style={[infoRowStyles.row, { borderBottomWidth: 0, alignItems: 'flex-start' }]}>
              <Text style={infoRowStyles.label}>Delivery Instructions</Text>
              <Text style={[infoRowStyles.value, { color: '#1C1C1E' }]}>
                {workTracker.dropoff_instructions || '—'}
              </Text>
            </View>
          </Section>

          {/* ── Signature Block ── */}
          {/* <Section title="Signatures" icon="pencil-outline">
            <Text style={styles.sigNote}>
              Please sign when the unit is dropped off at the destination.
            </Text>
            <View style={styles.sigRow}>
              <View style={styles.sigBlock}>
                <Text style={styles.sigLabel}>Carrier</Text>
                <View style={styles.sigLine} />
                <Text style={styles.sigDateLabel}>Date</Text>
                <View style={styles.sigLine} />
              </View>
              <View style={styles.sigBlock}>
                <Text style={styles.sigLabel}>Consignee</Text>
                <View style={styles.sigLine} />
                <Text style={styles.sigDateLabel}>Date</Text>
                <View style={styles.sigLine} />
              </View>
            </View>
          </Section> */}

          {/* ── Close Button ── */}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Trigger Button (drop-in for TripItem / CompletedTrips) ──────────────────
export function BOLButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={bolBtnStyles.btn} onPress={onPress}>
      <Ionicons name="document-text-outline" size={15} color={DARK_BLUE} />
      <Text style={bolBtnStyles.text}>Bill of Lading</Text>
    </TouchableOpacity>
  );
}

const bolBtnStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: DARK_BLUE,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: DARK_BLUE,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  modalHeader: {
    backgroundColor: DARK_BLUE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalHeaderLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: SURFACE,
    letterSpacing: 1.5,
  },
  modalHeaderSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 6,
  },
  shipperBanner: {
    backgroundColor: LIGHT_BLUE,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  shipperName: {
    fontSize: 13,
    fontWeight: '700',
    color: SURFACE,
  },
  shipperDetail: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  legalText: {
    fontSize: 12,
    color: MUTED,
    lineHeight: 18,
  },
  sigNote: {
    fontSize: 12,
    color: MUTED,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  sigRow: {
    flexDirection: 'row',
    gap: 16,
  },
  sigBlock: {
    flex: 1,
    gap: 8,
  },
  sigLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  sigLine: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#1C1C1E',
    marginTop: 24,
  },
  sigDateLabel: {
    fontSize: 12,
    color: MUTED,
    marginTop: 8,
  },
  doneBtn: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: SURFACE,
    letterSpacing: 0.5,
  },
});