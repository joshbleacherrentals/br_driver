import { useAddress } from '@/hooks/db/useAddress';
import { useBleacher } from '@/hooks/db/useBleacher';
import { WorkTracker } from '@/hooks/db/useWorkTrackers';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Brand colours ────────────────────────────────────────────────────────────
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
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateISO;
  }
}

function boolLabel(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return val ? 'Yes' : 'No';
}

function v(value: string | number | null | undefined, fallback = '—'): string {
  return value !== null && value !== undefined && value !== '' ? String(value) : fallback;
}

// ─── Load logo as base64 for HTML embedding ───────────────────────────────────
async function getLogoBase64(): Promise<string> {
  const asset = Asset.fromModule(require('../../assets/images/NEW-Bleacher-Rentals-logo.png'));
  await asset.downloadAsync();
  const base64 = await FileSystem.readAsStringAsync(asset.localUri!, {
    encoding: 'base64',
  });
  return `data:image/png;base64,${base64}`;
}

// ─── HTML Template for PDF ────────────────────────────────────────────────────
function buildBOLHtml(params: {
  workTracker: WorkTracker;
  bleacher: ReturnType<typeof useBleacher>['bleacher'];
  pickupAddress: ReturnType<typeof useAddress>['address'];
  dropoffAddress: ReturnType<typeof useAddress>['address'];
  logoBase64: string;
}): string {
  const { workTracker, bleacher, pickupAddress, dropoffAddress, logoBase64 } = params;

  const pickupFull = pickupAddress
    ? `${pickupAddress.street}, ${pickupAddress.city}, ${pickupAddress.state_province} ${pickupAddress.zip_postal}`
    : '—';

  const dropoffFull = dropoffAddress
    ? `${dropoffAddress.street}, ${dropoffAddress.city}, ${dropoffAddress.state_province} ${dropoffAddress.zip_postal}`
    : '—';

  const seats =
    bleacher?.bleacher_rows && bleacher?.bleacher_seats
      ? `${bleacher.bleacher_rows} rows / ${bleacher.bleacher_seats} seats`
      : bleacher?.bleacher_seats
      ? `${bleacher.bleacher_seats} seats`
      : '—';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 9pt;
      color: #000;
      padding: 20px;
      background: #fff;
    }

    /* ── Top header ── */
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .top-row img {
      height: 60px;
      width: auto;
      object-fit: contain;
    }
    .bol-title {
      font-size: 22pt;
      font-weight: bold;
      letter-spacing: 2px;
    }

    /* ── Generic bordered box ── */
    .box {
      border: 1px solid #000;
      margin-bottom: 4px;
      padding: 6px 8px;
    }

    /* ── Two-column row ── */
    .two-col {
      display: flex;
      border: 1px solid #000;
      margin-bottom: 4px;
    }
    .col {
      flex: 1;
      padding: 6px 8px;
    }
    .col-border {
      flex: 1;
      padding: 6px 8px;
      border-left: 1px solid #000;
    }

    /* ── Labels ── */
    .section-title {
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 5px;
      font-size: 9pt;
    }
    .bold { font-weight: bold; }
    .label { font-weight: bold; }

    /* ── Shipment detail lines ── */
    .detail-line {
      display: flex;
      margin-bottom: 4px;
      align-items: baseline;
    }
    .detail-line .label {
      margin-right: 4px;
      white-space: nowrap;
    }
    .detail-line .val { flex: 1; }

    /* ── Shipment grid ── */
    .shipment-grid { display: flex; gap: 16px; }
    .shipment-left { flex: 1; }
    .shipment-right { flex: 1; }

    /* ── Legal text ── */
    .legal { font-size: 7.5pt; line-height: 1.45; margin-bottom: 3px; }

    /* ── Pickup/Delivery side-by-side ── */
    .pd-row {
      display: flex;
      border: 1px solid #000;
      margin-bottom: 4px;
      min-height: 130px;
    }
    .pd-col { flex: 1; padding: 6px 8px; }
    .pd-col-border {
      flex: 1;
      padding: 6px 8px;
      border-left: 1px solid #000;
    }
    .pd-title {
      font-weight: bold;
      text-decoration: underline;
      text-align: center;
      margin-bottom: 7px;
    }
    .pd-line {
      display: flex;
      margin-bottom: 5px;
      align-items: baseline;
    }
    .pd-label {
      font-weight: bold;
      width: 130px;
      flex-shrink: 0;
      font-size: 8.5pt;
    }
    .pd-val { flex: 1; font-size: 8.5pt; }

    /* ── Signatures ── */
    .sig-box { border: 1px solid #000; padding: 8px; }
    .sig-note { font-size: 8.5pt; margin-bottom: 10px; }
    .sig-row { display: flex; margin-bottom: 14px; }
    .sig-col { flex: 1; }
    .sig-col-right { flex: 1; padding-left: 20px; }
    .sig-label { font-weight: bold; font-size: 9pt; margin-bottom: 18px; }
    .sig-line {
      border-bottom: 1px solid #000;
      width: 80%;
      margin-top: 4px;
    }
  </style>
</head>
<body>

  <!-- Top Row: Logo + Title -->
  <div class="top-row">
    <img src="${logoBase64}" />
    <div class="bol-title">BILL OF LADING</div>
  </div>

  <!-- Project # / BOL # -->
  <div class="two-col">
    <div class="col"><span class="bold">Project #&nbsp;</span>${v(workTracker.project_number, '')}</div>
    <div class="col-border"><span class="bold">BOL #</span></div>
  </div>

  <!-- Shipper / Contact -->
  <div class="two-col">
    <div class="col">
      <div class="bold">Shipper:</div>
      <div class="bold">Bleacher Rentals Florida LLC</div>
      <div>7901 4th St N 25767 St. Petersburg, FL 33702</div>
    </div>
    <div class="col-border">
      <div class="bold">Contact:</div>
      <div class="bold">Mike Timmermans</div>
      <div>(800) 436-0416</div>
    </div>
  </div>

  <!-- Shipment Details -->
  <div class="box">
    <div class="section-title">SHIPMENT DETAILS:</div>
    <div class="shipment-grid">
      <div class="shipment-left">
        <div class="detail-line">
          <span class="label">Item being shipped:&nbsp;</span>
          <span class="val">Mobile Bleacher Trailer</span>
        </div>
        <div class="detail-line">
          <span class="label">Unit Number:&nbsp;</span>
          <span class="val">${v(bleacher?.bleacher_number)}</span>
          <span class="label" style="margin-left:12px">Size / Seats:&nbsp;</span>
          <span class="val">${seats}</span>
        </div>
        <div class="detail-line">
          <span class="label">Hitch Type:&nbsp;</span>
          <span class="val">${v(bleacher?.hitch_type)}</span>
        </div>
        <div class="detail-line">
          <span class="label">GVWR:&nbsp;</span>
          <span class="val">${bleacher?.gvwr != null ? `${bleacher.gvwr} lbs` : '—'}</span>
        </div>
        <div class="detail-line">
          <span class="label">Notes:&nbsp;</span>
          <span class="val">Power Only &nbsp;&nbsp;&nbsp; Flatbed</span>
        </div>
      </div>
      <div class="shipment-right">
        <div class="detail-line">
          <span class="label">Quantity:&nbsp;</span>
          <span class="val">1</span>
        </div>
        <div class="detail-line">
          <span class="label">VIN:&nbsp;</span>
          <span class="val">${v(bleacher?.vin_number)}</span>
        </div>
        <div class="detail-line">
          <span class="label">Manufacturer:&nbsp;</span>
          <span class="val">${v(bleacher?.manufacturer)}</span>
        </div>
        <div class="detail-line">
          <span class="label">Height of Folded Unit:&nbsp;</span>
          <span class="val">${bleacher?.height_folded_ft != null ? `${bleacher.height_folded_ft} ft` : '—'}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Carrier / Payment Terms -->
  <div class="box">
    <div class="section-title">CARRIER:</div>
    <p class="legal">Carrier Liability agreed to a minimum of $100,000.00 cargo or equal to load declared value (whichever is greater). Load Declared value will not exceed $100,000 unless specified here: Actual load declared value is:</p>
    <div class="section-title" style="margin-top:5px">PAYMENT TERMS:</div>
    <p class="legal">Payment to the driver shall be made only upon the successful delivery and acceptance of the trailer unit(s) by the consignee. The consignee's signature on the bill of lading shall serve as confirmation that the unit has been received in acceptable condition.</p>
    <p class="legal">Any discrepancies or damages noted at delivery must be documented and communicated immediately.</p>
  </div>

  <!-- Pickup / Delivery -->
  <div class="pd-row">
    <div class="pd-col">
      <div class="pd-title">PICKUP INFORMATION (Trailer Origin)</div>
      <div class="pd-line"><span class="pd-label">Pick up date:</span><span class="pd-val">${v(workTracker.date)}</span></div>
      <div class="pd-line"><span class="pd-label">Pick up time:</span><span class="pd-val">${v(workTracker.pickup_time)}</span></div>
      <div class="pd-line"><span class="pd-label">Pick up address:</span><span class="pd-val">${pickupFull}</span></div>
      <div class="pd-line"><span class="pd-label">On site POC at pick up:</span><span class="pd-val">${v(workTracker.pickup_poc)}</span></div>
      <div class="pd-line"><span class="pd-label">Tear Down Required:</span><span class="pd-val">${boolLabel(workTracker.teardown_required)}</span></div>
      <div class="pd-line"><span class="pd-label">Pick up Instructions:</span><span class="pd-val">${v(workTracker.pickup_instructions)}</span></div>
    </div>
    <div class="pd-col-border">
      <div class="pd-title">DELIVERY INFORMATION (Trailer Destination)</div>
      <div class="pd-line"><span class="pd-label">Delivery date:</span><span class="pd-val">${v(workTracker.date)}</span></div>
      <div class="pd-line"><span class="pd-label">Delivery time:</span><span class="pd-val">${v(workTracker.dropoff_time)}</span></div>
      <div class="pd-line"><span class="pd-label">Delivery address:</span><span class="pd-val">${dropoffFull}</span></div>
      <div class="pd-line"><span class="pd-label">On site POC at delivery (Consignee):</span><span class="pd-val">${v(workTracker.dropoff_poc)}</span></div>
      <div class="pd-line"><span class="pd-label">Set Up Required:</span><span class="pd-val">${boolLabel(workTracker.setup_required)}</span></div>
      <div class="pd-line"><span class="pd-label">Delivery Instructions:</span><span class="pd-val">${v(workTracker.dropoff_instructions)}</span></div>
    </div>
  </div>

  <!-- Signatures -->
  <div class="sig-box">
    <div class="sig-note"><strong>Signatures</strong> (Please sign when the unit is dropped off at the destination.)</div>
    <div class="sig-row">
      <div class="sig-col">
        <div class="sig-label">Carrier:</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-col-right">
        <div class="sig-label">Date:</div>
        <div class="sig-line"></div>
      </div>
    </div>
    <div class="sig-row">
      <div class="sig-col">
        <div class="sig-label">Consignee:</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-col-right">
        <div class="sig-label">Date:</div>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>

</body>
</html>
  `;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InfoRow({ label, value, accent }: { label: string; value?: string | number | null; accent?: boolean }) {
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: DIVIDER, gap: 12 },
  label: { fontSize: 13, fontWeight: '500', color: MUTED, flex: 1 },
  value: { fontSize: 13, fontWeight: '600', color: '#1C1C1E', flex: 1.4, textAlign: 'right' },
  accentValue: { color: ACCENT },
});

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.card}>
      <View style={sectionStyles.titleRow}>
        {icon && <Ionicons name={icon as any} size={16} color={DARK_BLUE} style={{ marginRight: 6 }} />}
        <Text style={sectionStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: { backgroundColor: SURFACE, borderRadius: 12, padding: 16, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: DARK_BLUE },
  title: { fontSize: 13, fontWeight: '700', color: DARK_BLUE, letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BillOfLading({ visible, workTracker, onClose }: BillOfLadingProps) {
  const { address: pickupAddress } = useAddress(workTracker.pickup_address_uuid);
  const { address: dropoffAddress } = useAddress(workTracker.dropoff_address_uuid);
  const { bleacher } = useBleacher(workTracker.bleacher_uuid);
  const [printing, setPrinting] = React.useState(false);

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

  const handleDownloadPDF = async () => {
    try {
      setPrinting(true);
      const logoBase64 = await getLogoBase64();
      const html = buildBOLHtml({ workTracker, bleacher, pickupAddress, dropoffAddress, logoBase64 });
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `BOL_Bleacher${bleacher?.bleacher_number ?? ''}_${workTracker.date ?? 'draft'}.pdf`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sharing not available', 'Unable to share files on this device.');
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>

        {/* ── Modal Header ── */}
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalHeaderLabel}>BILL OF LADING</Text>
            {workTracker.project_number && (
              <Text style={styles.modalHeaderSub}>Project #{workTracker.project_number}</Text>
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

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Shipment Details ── */}
          <Section title="Shipment Details" icon="cube-outline">
            <InfoRow label="Item" value="Mobile Bleacher Trailer" />
            <InfoRow label="Unit Number" value={bleacher?.bleacher_number} />
            <InfoRow label="Size / Seats" value={seats} />
            <InfoRow label="VIN" value={bleacher?.vin_number} />
            <InfoRow label="TAG #" value={bleacher?.tag_number} />
            <InfoRow label="Hitch Type" value={bleacher?.hitch_type} />
            <InfoRow label="Manufacturer" value={bleacher?.manufacturer} />
            <InfoRow label="GVWR" value={bleacher?.gvwr != null ? `${bleacher.gvwr} lbs` : null} />
            <InfoRow label="Height (Folded)" value={bleacher?.height_folded_ft != null ? `${bleacher.height_folded_ft} ft` : null} />
            <View style={[infoRowStyles.row, { borderBottomWidth: 0 }]}>
              <Text style={infoRowStyles.label}>Notes</Text>
              <Text style={[infoRowStyles.value, { color: MUTED }]}>Power Only · Flatbed</Text>
            </View>
          </Section>

          {/* ── Carrier & Payment ── */}
          <Section title="Carrier & Payment Terms" icon="document-text-outline">
            <Text style={styles.legalText}>
              Carrier liability agreed to a minimum of $100,000.00 cargo or equal to load declared value (whichever is greater).
            </Text>
            <Text style={[styles.legalText, { marginTop: 8 }]}>
              Payment is due only upon successful delivery and acceptance by the consignee. Any discrepancies or damages must be documented and communicated immediately.
            </Text>
          </Section>

          {/* ── Pickup ── */}
          <Section title="Pickup Information" icon="location-outline">
            <InfoRow label="Date" value={formatDate(workTracker.date)} />
            <InfoRow label="Time" value={workTracker.pickup_time} />
            <InfoRow label="Address" value={pickupFull} accent />
            <InfoRow label="On-Site POC" value={workTracker.pickup_poc} />
            <InfoRow label="Tear Down Required" value={boolLabel(workTracker.teardown_required)} />
            <View style={[infoRowStyles.row, { borderBottomWidth: 0, alignItems: 'flex-start' }]}>
              <Text style={infoRowStyles.label}>Pickup Instructions</Text>
              <Text style={[infoRowStyles.value, { color: '#1C1C1E' }]}>{workTracker.pickup_instructions || '—'}</Text>
            </View>
          </Section>

          {/* ── Delivery ── */}
          <Section title="Delivery Information" icon="flag-outline">
            <InfoRow label="Date" value={formatDate(workTracker.date)} />
            <InfoRow label="Time" value={workTracker.dropoff_time} />
            <InfoRow label="Address" value={dropoffFull} accent />
            <InfoRow label="On-Site POC (Consignee)" value={workTracker.dropoff_poc} />
            <InfoRow label="Set Up Required" value={boolLabel(workTracker.setup_required)} />
            <View style={[infoRowStyles.row, { borderBottomWidth: 0, alignItems: 'flex-start' }]}>
              <Text style={infoRowStyles.label}>Delivery Instructions</Text>
              <Text style={[infoRowStyles.value, { color: '#1C1C1E' }]}>{workTracker.dropoff_instructions || '—'}</Text>
            </View>
          </Section>

          {/* ── Signature Block ──
          <Section title="Signatures" icon="pencil-outline">
            <Text style={styles.sigNote}>Please sign when the unit is dropped off at the destination.</Text>
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

          {/* ── Download PDF Button ── */}
          <TouchableOpacity
            style={[styles.downloadBtn, printing && styles.downloadBtnDisabled]}
            onPress={handleDownloadPDF}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator color={SURFACE} size="small" />
            ) : (
              <Ionicons name="download-outline" size={18} color={SURFACE} />
            )}
            <Text style={styles.downloadBtnText}>
              {printing ? 'Generating PDF…' : 'Download PDF'}
            </Text>
          </TouchableOpacity>

          {/* ── Close Button ── */}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Close</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Trigger Button ───────────────────────────────────────────────────────────
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
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  text: { fontSize: 13, fontWeight: '600', color: DARK_BLUE },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  modalHeader: { backgroundColor: DARK_BLUE, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  modalHeaderLabel: { fontSize: 18, fontWeight: '800', color: SURFACE, letterSpacing: 1.5 },
  modalHeaderSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  closeBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 6 },
  shipperBanner: { backgroundColor: LIGHT_BLUE, paddingHorizontal: 20, paddingVertical: 10 },
  shipperName: { fontSize: 13, fontWeight: '700', color: SURFACE },
  shipperDetail: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  legalText: { fontSize: 12, color: MUTED, lineHeight: 18 },
  sigNote: { fontSize: 12, color: MUTED, fontStyle: 'italic', marginBottom: 16 },
  sigRow: { flexDirection: 'row', gap: 16 },
  sigBlock: { flex: 1, gap: 8 },
  sigLabel: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  sigLine: { borderBottomWidth: 1.5, borderBottomColor: '#1C1C1E', marginTop: 24 },
  sigDateLabel: { fontSize: 12, color: MUTED, marginTop: 8 },
  downloadBtn: {
    backgroundColor: LIGHT_BLUE,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE, letterSpacing: 0.3 },
  doneBtn: { backgroundColor: DARK_BLUE, paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 0 },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: SURFACE, letterSpacing: 0.5 },
});