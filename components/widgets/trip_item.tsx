import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import BleacherDamageBadge from "@/components/widgets/bleacherDamageBadge";
import { useRouter } from "expo-router";
import BottomSheetModal from "@/components/ui/BottomSheetModal";
import ExistingDamageChecklist from "@/components/widgets/ExistingDamageChecklist";
import ViewDamageReportsButton from "@/components/widgets/ViewDamageReportsButton";
import { InspectionDetailModal } from "@/components/widgets/inspectionSummaryWidget";
import { InspectionPhotoRepair } from "@/components/widgets/InspectionPhotoRepair";
import { useAddress } from "@/hooks/db/useAddress";
import { useBleacher } from "@/hooks/db/useBleacher";
import { useDamageReports } from "@/hooks/db/useDamageReport";
import {
  getEffectiveBleacherUuid,
  isSwappedBleacher,
} from "@/utils/effectiveBleacher";
import { bleacherChangeReasonLabel } from "@/constants/bleacherChangeReasons";
import { useInspection } from "@/hooks/db/useInspection";
import { useWorkTrackerKind } from "@/hooks/db/useWorkTrackerTypes";
import TripStopSection from "@/components/widgets/trip/TripStopSection";
import WorkTrackerKindBadge from "@/components/widgets/trip/WorkTrackerKindBadge";
import {
  workTrackerActionLabels,
  workTrackerKindColor,
} from "@/constants/workTrackerKinds";
import { buildTripStops } from "@/utils/tripStops";
import { isSingleLeg, tripHasInspections } from "@/utils/workTrackerKind";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { ThemeColors, typeScale } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BillOfLading, { BOLButton } from "./billOfLading";
import { PayAmount } from "./payBreakdown";

function getStatusBadge(status: WorkTracker["status"], theme: ThemeColors) {
  switch (status) {
    case "released":
      return { text: "PENDING ACCEPTANCE", color: theme.secondaryAccent };
    case "accepted":
      return { text: "ACCEPTED", color: theme.secondaryAccent };
    case "dest_pickup":
    case "pickup_inspection":
    case "dest_dropoff":
    case "dropoff_inspection":
      return { text: "EN ROUTE", color: theme.warning };
    case "completed":
      return { text: "COMPLETED", color: theme.textTertiary };
    case "cancelled":
      return { text: "CANCELLED", color: theme.danger };
    default:
      return null;
  }
}

interface TripItemProps {
  workTracker: WorkTracker;
  /**
   * Short reason this trip cannot be accepted (from `useAcceptTrip`), or
   * `null` when it can. Shown on the button so the driver sees the problem
   * before tapping, not after.
   */
  acceptBlockReason?: string | null;
  /** Opens the fix for `acceptBlockReason` — the documents screen. */
  onFixBlock?: (workTrackerId: string) => void;
  onAccept?: (workTrackerId: string) => void;
  onStartTrip?: (workTrackerId: string) => void;
  onSkip?: (workTrackerId: string) => void;
  onArrived?: (workTrackerId: string, arrivedAt: string) => void;
  /**
   * Closes a job that has no inspection to close it — repair and site-visit
   * work only. A trip is completed by submitting its drop-off inspection.
   */
  onCompleteJob?: (workTrackerId: string) => void;
  onStartInspection?: (
    workTrackerId: string,
    inspectionType: "pickup" | "dropoff",
  ) => void;
}

/** Stable identity: the read-only sheet selects nothing, ever. */
const EMPTY_SELECTION: string[] = [];

function TripItem({
  workTracker,
  acceptBlockReason = null,
  onFixBlock,
  onAccept,
  onStartTrip,
  onSkip,
  onArrived,
  onCompleteJob,
  onStartInspection,
}: TripItemProps) {
  const { theme } = useTheme();
  const {
    status,
    pickup_address_uuid,
    dropoff_address_uuid,
    date,
    pay_cents,
    notes,
    accepted_at,
  } = workTracker;

  const [bolVisible, setBolVisible] = React.useState(false);
  const [preInspectionVisible, setPreInspectionVisible] = React.useState(false);
  const [postInspectionVisible, setPostInspectionVisible] =
    React.useState(false);

  const pickupAddressData = useAddress(pickup_address_uuid);
  const dropoffAddressData = useAddress(dropoff_address_uuid);

  // What kind of work this is decides the whole shape of the card: two stops
  // and two inspections, or one of each.
  const kind = useWorkTrackerKind(workTracker.work_tracker_type_uuid);
  const singleLeg = isSingleLeg(kind);
  // A repair or a site visit never inspects anything — see tripHasInspections.
  const inspects = tripHasInspections(kind);
  const actionLabels = workTrackerActionLabels(kind);
  const kindColor = workTrackerKindColor(kind, theme);
  // What the driver is physically hauling: the bleacher they confirmed taking,
  // falling back to the one the manager assigned until they confirm.
  const effectiveBleacherUuid = getEffectiveBleacherUuid(workTracker);
  const { bleacher } = useBleacher(effectiveBleacherUuid);

  // Only when the two differ is the assigned bleacher worth naming — and only
  // then is it worth a second query, which `useBleacher(null)` skips entirely.
  const swapped = isSwappedBleacher(workTracker);
  const { bleacher: assignedBleacher } = useBleacher(
    swapped ? workTracker.bleacher_uuid : null,
  );

  // Load full inspection (incl. answers_json) only when the modal is open.
  const { inspection: preInspection } = useInspection(
    preInspectionVisible ? (workTracker.pre_inspection_uuid ?? null) : null,
  );
  const { inspection: postInspection } = useInspection(
    postInspectionVisible ? (workTracker.post_inspection_uuid ?? null) : null,
  );

  // ── Damage report for the bleacher actually being hauled ────────────────
  const { damageReports } = useDamageReports(effectiveBleacherUuid);

  const router = useRouter();

  // The read-only list behind "View Damage Reports": what is already known
  // about this bleacher, so a driver has the paper trail before a dropoff
  // dispute — and does not file the fourth report about the same plank.
  const [damageListVisible, setDamageListVisible] = useState(false);

  const openDamageReport = useCallback(
    (damageReportId: string) => {
      setDamageListVisible(false);
      router.push({
        pathname: "/damage-report-view",
        params: { damageReportId },
      });
    },
    [router],
  );

  const hasPreInspection = !!workTracker.pre_inspection_uuid;
  const hasPostInspection = !!workTracker.post_inspection_uuid;

  if (status === "draft" || status === "completed") return null;

  const stops = buildTripStops({
    kind,
    workTracker,
    pickupAddress: pickupAddressData.address,
    dropoffAddress: dropoffAddressData.address,
  });

  const formatDate = (dateISO?: string | null) => {
    if (!dateISO) return "Date not set";
    try {
      const d = new Date(dateISO + "T00:00:00");
      const day = d.getDate();
      const ord = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return (s as any)[(v - 20) % 10] || (s as any)[v] || s[0];
      };
      const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
      const month_short = d.toLocaleDateString(undefined, { month: "short" });
      return `${weekday}, ${month_short} ${day}${ord(day)}`;
    } catch {
      return "Invalid date";
    }
  };

  const openInMaps = async (address?: string) => {
    if (!address) return;
    const q = encodeURIComponent(address);
    const allOptions = [
      {
        label: "Apple Maps",
        url: `maps://?q=${q}`,
        fallbackUrl: `http://maps.apple.com/?q=${q}`,
        iosOnly: true,
      },
      {
        label: "Google Maps",
        url:
          Platform.OS === "ios" ? `comgooglemaps://?q=${q}` : `geo:0,0?q=${q}`,
        fallbackUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
        iosOnly: false,
      },
      {
        label: "Waze",
        url: `waze://?q=${q}&navigate=false`,
        fallbackUrl: `https://waze.com/ul?q=${q}`,
        iosOnly: false,
      },
    ];
    const visibleOptions = allOptions.filter(
      (o) => !o.iosOnly || Platform.OS === "ios",
    );
    Alert.alert("Open in Maps", "Choose an app:", [
      ...visibleOptions.map((option) => ({
        text: option.label,
        onPress: async () => {
          try {
            const supported = await Linking.canOpenURL(option.url);
            await Linking.openURL(supported ? option.url : option.fallbackUrl);
          } catch {
            Alert.alert("Error", "Could not open maps");
          }
        },
      })),
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const badge = getStatusBadge(status, theme);

  // Which bleacher the inspection is for is settled inside the inspection
  // itself — the driver confirms it there — so it is not passed down.
  const handleStartInspection = (id: string, type: "pickup" | "dropoff") => {
    onStartInspection?.(id, type);
  };

  return (
    <Card style={[styles.card, { borderLeftColor: kindColor }]}>
      {/* ── Top Header: Bleacher, Pay & damage badge ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.topHeader}>
          {/* Title row: bleacher number + damage badge + tappable pay */}
          <View style={styles.titleRow}>
            <Text style={[styles.mainTitle, { color: theme.textPrimary }]}>
              {effectiveBleacherUuid &&
                bleacher &&
                `Bleacher #${bleacher.bleacher_number} `}
              {damageReports.length > 0 && (
                <BleacherDamageBadge
                  damageReport={damageReports[0]}
                  bleacherNumber={bleacher?.bleacher_number}
                />
              )}
            </Text>
            <PayAmount workTrackerId={workTracker.id} payCents={pay_cents} />
          </View>
          {swapped && assignedBleacher ? (
            <Text style={[styles.swapNote, { color: theme.warning }]}>
              {`Assigned #${assignedBleacher.bleacher_number}`}
              {bleacherChangeReasonLabel(workTracker.bleacher_change_reason)
                ? ` — ${bleacherChangeReasonLabel(workTracker.bleacher_change_reason)}`
                : ""}
            </Text>
          ) : null}
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {formatDate(date)}
          </Text>
          <View style={styles.kindBadgeRow}>
            <WorkTrackerKindBadge kind={kind} theme={theme} />
          </View>
        </View>
        {badge && (
          <View style={styles.badgeAndBol}>
            <Badge
              label={badge.text}
              color={badge.color}
              variant="solid"
              uppercase
            />
            <BOLButton onPress={() => setBolVisible(true)} />
          </View>
        )}
      </View>

      {/* Notes */}
      {!!notes && (
        <View
          style={[styles.notesBox, { backgroundColor: theme.surfaceElevated }]}
        >
          <Text style={[styles.notesLabel, { color: theme.textTertiary }]}>
            Notes
          </Text>
          <Text style={[styles.notesText, { color: theme.textPrimary }]}>
            {notes}
          </Text>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: theme.separator }]} />

      {/* The first — and, for a repair or a site visit, the only — stop. */}
      <TripStopSection
        stop={stops[0]}
        theme={theme}
        status={status}
        acceptedAt={accepted_at}
        onOpenMaps={(query) => openInMaps(query ?? undefined)}
      />

      {/* The pick-up leg and everything that happens on it — a repair or a
          site visit has neither: one stop, one inspection. */}
      {!singleLeg && (
        <>
          {/* I've Arrived (pickup) */}
          {status === "dest_pickup" && (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                ]}
                onPress={() =>
                  onArrived?.(workTracker.id, new Date().toISOString())
                }
              >
                <Text
                  style={[styles.primaryButtonText, { color: theme.onAccent }]}
                >
                  Arrived at Pickup
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Start Pickup Inspection */}
          {status === "pickup_inspection" && (
            <View style={styles.inspectionBlock}>
              <TouchableOpacity
                style={[
                  styles.inspectionButton,
                  { backgroundColor: theme.warning },
                ]}
                onPress={() => handleStartInspection(workTracker.id, "pickup")}
              >
                <Text
                  style={[
                    styles.inspectionButtonText,
                    { color: theme.onAccent },
                  ]}
                >
                  Start Inspection
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {hasPreInspection && (
            <>
              <InspectionPhotoRepair
                inspectionUuid={workTracker.pre_inspection_uuid}
                tripStatus={status}
              />
              <TouchableOpacity
                style={[
                  styles.viewInspectionButton,
                  { borderColor: theme.secondaryAccent },
                ]}
                onPress={() => setPreInspectionVisible(true)}
              >
                <Ionicons
                  name="clipboard-outline"
                  size={14}
                  color={theme.secondaryAccent}
                />
                <Text
                  style={[
                    styles.viewInspectionText,
                    { color: theme.secondaryAccent },
                  ]}
                >
                  View Pickup Inspection
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={theme.secondaryAccent}
                />
              </TouchableOpacity>
              {preInspectionVisible && preInspection ? (
                <InspectionDetailModal
                  visible={preInspectionVisible}
                  inspection={preInspection}
                  damages={damageReports}
                  title="Pickup Inspection"
                  onClose={() => setPreInspectionVisible(false)}
                />
              ) : null}
              <ViewDamageReportsButton
                count={damageReports.length}
                onPress={() => setDamageListVisible(true)}
                style={styles.viewDamageReportsButton}
              />
            </>
          )}

          <View
            style={[styles.divider, { backgroundColor: theme.separator }]}
          />

          <View
            style={[styles.divider, { backgroundColor: theme.separator }]}
          />

          <TripStopSection
            stop={stops[1]}
            theme={theme}
            status={status}
            acceptedAt={accepted_at}
            onOpenMaps={(query) => openInMaps(query ?? undefined)}
          />
        </>
      )}

      {/* Action buttons */}
      {status === "released" &&
        (acceptBlockReason ? (
          /* No Accept button at all while something blocks it — the one
             control on the card is the way out of the block. */
          <TouchableOpacity
            style={[
              styles.blockedButton,
              {
                backgroundColor: theme.danger + "14",
                borderColor: theme.danger,
              },
            ]}
            onPress={() => onFixBlock?.(workTracker.id)}
            accessibilityRole="button"
            accessibilityLabel={`${acceptBlockReason}. Tap to fix.`}
          >
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={theme.danger}
            />
            <Text style={[styles.blockedButtonText, { color: theme.danger }]}>
              {acceptBlockReason} — tap to fix
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.acceptButton,
              { backgroundColor: theme.secondaryAccent },
            ]}
            onPress={() => onAccept?.(workTracker.id)}
          >
            <Text
              style={[
                styles.acceptButtonText,
                { color: theme.onSecondaryAccent },
              ]}
            >
              {actionLabels.accept}
            </Text>
          </TouchableOpacity>
        ))}
      {status === "accepted" && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={() => onStartTrip?.(workTracker.id)}
          >
            <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>
              {actionLabels.start}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {status === "dest_dropoff" && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={() =>
              onArrived?.(workTracker.id, new Date().toISOString())
            }
          >
            <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>
              {actionLabels.arrived}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {status === "dropoff_inspection" &&
        (inspects ? (
          <TouchableOpacity
            style={[styles.inspectionButton, { backgroundColor: theme.warning }]}
            onPress={() => handleStartInspection(workTracker.id, "dropoff")}
          >
            <Text
              style={[styles.inspectionButtonText, { color: theme.onAccent }]}
            >
              Start Inspection
            </Text>
          </TouchableOpacity>
        ) : (
          // Nothing to inspect, so this status means "on site" and the driver
          // closes the job themselves once the work is done.
          <TouchableOpacity
            style={[
              styles.inspectionButton,
              { backgroundColor: theme.secondaryAccent },
            ]}
            onPress={() => onCompleteJob?.(workTracker.id)}
          >
            <Text
              style={[
                styles.inspectionButtonText,
                { color: theme.onSecondaryAccent },
              ]}
            >
              Complete Job
            </Text>
          </TouchableOpacity>
        ))}

      {inspects && hasPostInspection && (
        <>
          <InspectionPhotoRepair
            inspectionUuid={workTracker.post_inspection_uuid}
            tripStatus={status}
          />
          <TouchableOpacity
            style={[
              styles.viewInspectionButton,
              { borderColor: theme.secondaryAccent },
            ]}
            onPress={() => setPostInspectionVisible(true)}
          >
            <Ionicons
              name="clipboard-outline"
              size={14}
              color={theme.secondaryAccent}
            />
            <Text
              style={[
                styles.viewInspectionText,
                { color: theme.secondaryAccent },
              ]}
            >
              {actionLabels.viewInspection}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={theme.secondaryAccent}
            />
          </TouchableOpacity>
          {postInspectionVisible && postInspection ? (
            <InspectionDetailModal
              visible={postInspectionVisible}
              inspection={postInspection}
              damages={damageReports}
              title={actionLabels.inspectionTitle}
              onClose={() => setPostInspectionVisible(false)}
            />
          ) : null}
          <ViewDamageReportsButton
            count={damageReports.length}
            onPress={() => setDamageListVisible(true)}
            style={styles.viewDamageReportsButton}
          />
        </>
      )}

      {/* Read-only: nothing here is being selected, the driver is finding out
          what is already known about the bleacher they are hauling. */}
      <BottomSheetModal
        visible={damageListVisible}
        onClose={() => setDamageListVisible(false)}
      >
        <ScrollView contentContainerStyle={styles.damageSheetContent}>
          <Text style={[styles.damageSheetTitle, { color: theme.header }]}>
            Damage on this bleacher
          </Text>
          <ExistingDamageChecklist
            bleacherUuid={effectiveBleacherUuid}
            selectedIds={EMPTY_SELECTION}
            mode="view"
            onOpenReport={openDamageReport}
          />
        </ScrollView>
      </BottomSheetModal>

      <BillOfLading
        visible={bolVisible}
        workTracker={workTracker}
        onClose={() => setBolVisible(false)}
      />
    </Card>
  );
}

function tripItemPropsEqual(prev: TripItemProps, next: TripItemProps): boolean {
  return (
    prev.workTracker === next.workTracker &&
    prev.acceptBlockReason === next.acceptBlockReason &&
    prev.onFixBlock === next.onFixBlock &&
    prev.onAccept === next.onAccept &&
    prev.onStartTrip === next.onStartTrip &&
    prev.onSkip === next.onSkip &&
    prev.onArrived === next.onArrived &&
    prev.onStartInspection === next.onStartInspection
  );
}

export default React.memo(TripItem, tripItemPropsEqual);

const styles = StyleSheet.create({
  badgeAndBol: { alignItems: "flex-end", flexShrink: 0 },
  swapNote: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  card: {
    marginVertical: 6,
    marginHorizontal: 16,
    // The kind's colour, wide enough to read at a glance down a scrolling list.
    borderLeftWidth: 6,
  },
  topHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  topHeader: { flex: 1 },
  // ── new: title row holds bleacher text + damage badge side-by-side ──
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  mainTitle: { ...typeScale.title2, fontWeight: "700" },
  kindBadgeRow: { marginTop: 6 },
  dateText: { ...typeScale.subhead, fontWeight: "400" },
  notesBox: { borderRadius: 8, padding: 12, marginBottom: 12 },
  notesLabel: { ...typeScale.caption, marginBottom: 4, fontWeight: "400" },
  notesText: { ...typeScale.subhead },
  divider: { height: 1, marginVertical: 12 },
  stopSection: { marginBottom: 8 },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stopHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  stopHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationLabel: {
    ...typeScale.footnote,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  timeText: { ...typeScale.subhead, fontWeight: "600" },
  addressText: {
    ...typeScale.subhead,
    fontWeight: "600",
    marginBottom: 4,
  },
  detailText: { ...typeScale.footnote, marginTop: 2 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  flagText: { ...typeScale.footnote, fontWeight: "600" },
  instructionsBox: {
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  instructionsLabel: {
    ...typeScale.caption2,
    fontWeight: "700",
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  instructionsText: { ...typeScale.footnote },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  primaryButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: { ...typeScale.subhead, fontWeight: "600" },
  acceptButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  acceptButtonText: { ...typeScale.subhead, fontWeight: "600" },
  blockedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  blockedButtonText: {
    ...typeScale.subhead,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "center",
  },
  inspectionBlock: { marginTop: 12, gap: 10 },
  inspectionButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  inspectionButtonText: { ...typeScale.subhead, fontWeight: "600" },
  viewDamageReportsButton: { alignSelf: "flex-start", marginTop: 8 },
  damageSheetContent: { padding: 16, gap: 12 },
  damageSheetTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  viewInspectionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 10,
  },
  viewInspectionText: { ...typeScale.footnote, fontWeight: "600" },
});
