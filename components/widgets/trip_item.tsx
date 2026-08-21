import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import BleacherDamageBadge from "@/components/widgets/bleacherDamageBadge";
import { InspectionDetailModal } from "@/components/widgets/inspectionSummaryWidget";
import { InspectionPhotoRepair } from "@/components/widgets/InspectionPhotoRepair";
import { useAddress } from "@/hooks/db/useAddress";
import { useBleacher } from "@/hooks/db/useBleacher";
import { useDamageReports } from "@/hooks/db/useDamageReport";
import { useInspection } from "@/hooks/db/useInspection";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { ThemeColors, typeScale } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
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
  onAccept?: (workTrackerId: string) => void;
  onStartTrip?: (workTrackerId: string) => void;
  onSkip?: (workTrackerId: string) => void;
  onArrived?: (workTrackerId: string, arrivedAt: string) => void;
  onStartInspection?: (
    workTrackerId: string,
    bleacherUuid: string | null,
    inspectionType: "pickup" | "dropoff",
  ) => void;
}

function TripItem({
  workTracker,
  onAccept,
  onStartTrip,
  onSkip,
  onArrived,
  onStartInspection,
}: TripItemProps) {
  const { theme } = useTheme();
  const {
    status,
    pickup_address_uuid,
    dropoff_address_uuid,
    date,
    pickup_time,
    dropoff_time,
    pickup_poc,
    dropoff_poc,
    bleacher_uuid,
    pay_cents,
    notes,
    teardown_required,
    pickup_instructions,
    setup_required,
    dropoff_instructions,
  } = workTracker;

  const [bolVisible, setBolVisible] = React.useState(false);
  const [preInspectionVisible, setPreInspectionVisible] = React.useState(false);
  const [postInspectionVisible, setPostInspectionVisible] =
    React.useState(false);

  const pickupAddressData = useAddress(pickup_address_uuid);
  const dropoffAddressData = useAddress(dropoff_address_uuid);
  const { bleacher } = useBleacher(bleacher_uuid);

  // Load full inspection (incl. answers_json) only when the modal is open.
  const { inspection: preInspection } = useInspection(
    preInspectionVisible
      ? (workTracker.pre_inspection_uuid ?? null)
      : null,
  );
  const { inspection: postInspection } = useInspection(
    postInspectionVisible
      ? (workTracker.post_inspection_uuid ?? null)
      : null,
  );

  // ── Damage report for the assigned bleacher ─────────────────────────────
  const { damageReports } = useDamageReports(bleacher_uuid);

  const hasPreInspection = !!workTracker.pre_inspection_uuid;
  const hasPostInspection = !!workTracker.post_inspection_uuid;

  if (status === "draft" || status === "completed") return null;

  const formatAddress = (type: "pickup" | "dropoff") => {
    const address =
      type === "pickup"
        ? pickupAddressData.address
        : dropoffAddressData.address;
    if (!address) return "Address not set";
    return `${address.street}`;
  };

  const formatTime = (time: string | null) => time ?? "";

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
  const showTeardown = teardown_required === 1;
  const showSetup = setup_required === 1;

  const handleStartInspection = (
    id: string,
    bleacherUuid: string | null,
    type: "pickup" | "dropoff",
  ) => {
    onStartInspection?.(id, bleacherUuid, type);
  };

  return (
    <Card style={styles.card}>
      {/* ── Top Header: Bleacher, Pay & damage badge ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.topHeader}>
          {/* Title row: bleacher number + damage badge + tappable pay */}
          <View style={styles.titleRow}>
            <Text style={[styles.mainTitle, { color: theme.textPrimary }]}>
              {bleacher_uuid &&
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
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {formatDate(date)}
          </Text>
        </View>
        {badge && (
          <View style={styles.badgeAndBol}>
            <Badge label={badge.text} color={badge.color} variant="solid" uppercase />
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

      {/* ── PICKUP ── */}
      <View style={styles.stopSection}>
        <View style={styles.stopHeader}>
          <View style={styles.stopHeaderLeft}>
            <Ionicons name="location" size={16} color={theme.accent} />
            <Text style={[styles.locationLabel, { color: theme.textPrimary }]}>
              PICKUP
            </Text>
          </View>
          {pickup_time && (
            <Text style={[styles.timeText, { color: theme.textPrimary }]}>
              {formatTime(pickup_time)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => {
            const addr = pickupAddressData.address;
            openInMaps(
              addr
                ? `${addr.street}, ${addr.city}, ${addr.state_province}, ${addr.zip_postal}`
                : undefined,
            );
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.addressText, { color: theme.accent }]}>
            {formatAddress("pickup")}
          </Text>
        </TouchableOpacity>

        {!!pickup_poc && (
          <Text style={[styles.detailText, { color: theme.textSecondary }]}>
            POC: {pickup_poc}
          </Text>
        )}
        {showTeardown && (
          <View style={styles.flagRow}>
            <Ionicons
              name="construct-outline"
              size={14}
              color={theme.warning}
            />
            <Text style={[styles.flagText, { color: theme.warning }]}>
              Tear Down Required
            </Text>
          </View>
        )}
        {!!pickup_instructions && (
          <View
            style={[
              styles.instructionsBox,
              {
                backgroundColor: theme.accentSoft,
                borderLeftColor: theme.accent,
              },
            ]}
          >
            <Text
              style={[styles.instructionsLabel, { color: theme.accent }]}
            >
              Pickup Instructions
            </Text>
            <Text
              style={[styles.instructionsText, { color: theme.textPrimary }]}
            >
              {pickup_instructions}
            </Text>
          </View>
        )}
      </View>

      {/* I've Arrived (pickup) */}
      {status === "dest_pickup" && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
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
            onPress={() =>
              handleStartInspection(
                workTracker.id,
                workTracker.bleacher_uuid,
                "pickup",
              )
            }
          >
            <Text
              style={[styles.inspectionButtonText, { color: theme.onAccent }]}
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
        </>
      )}

      <View style={[styles.divider, { backgroundColor: theme.separator }]} />

      {/* ── DROP-OFF ── */}
      <View style={styles.stopSection}>
        <View style={styles.stopHeader}>
          <View style={styles.stopHeaderLeft}>
            <Ionicons name="location" size={16} color={theme.accent} />
            <Text style={[styles.locationLabel, { color: theme.textPrimary }]}>
              DROP-OFF
            </Text>
          </View>
          {dropoff_time && (
            <Text style={[styles.timeText, { color: theme.textPrimary }]}>
              {formatTime(dropoff_time)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => {
            const addr = dropoffAddressData.address;
            openInMaps(
              addr
                ? `${addr.street}, ${addr.city}, ${addr.state_province}, ${addr.zip_postal}`
                : undefined,
            );
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.addressText, { color: theme.accent }]}>
            {formatAddress("dropoff")}
          </Text>
        </TouchableOpacity>

        {!!dropoff_poc && (
          <Text style={[styles.detailText, { color: theme.textSecondary }]}>
            POC: {dropoff_poc}
          </Text>
        )}
        {showSetup && (
          <View style={styles.flagRow}>
            <Ionicons
              name="construct-outline"
              size={14}
              color={theme.warning}
            />
            <Text style={[styles.flagText, { color: theme.warning }]}>
              Set Up Required
            </Text>
          </View>
        )}
        {!!dropoff_instructions && (
          <View
            style={[
              styles.instructionsBox,
              {
                backgroundColor: theme.accentSoft,
                borderLeftColor: theme.accent,
              },
            ]}
          >
            <Text
              style={[styles.instructionsLabel, { color: theme.accent }]}
            >
              Drop-off Instructions
            </Text>
            <Text
              style={[styles.instructionsText, { color: theme.textPrimary }]}
            >
              {dropoff_instructions}
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      {status === "released" && (
        <TouchableOpacity
          style={[
            styles.acceptButton,
            { backgroundColor: theme.secondaryAccent },
          ]}
          onPress={() => onAccept?.(workTracker.id)}
        >
          <Text
            style={[styles.acceptButtonText, { color: theme.onSecondaryAccent }]}
          >
            Accept Trip
          </Text>
        </TouchableOpacity>
      )}
      {status === "accepted" && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={() => onStartTrip?.(workTracker.id)}
          >
            <Text
              style={[styles.primaryButtonText, { color: theme.onAccent }]}
            >
              Start Trip
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
            <Text
              style={[styles.primaryButtonText, { color: theme.onAccent }]}
            >
              Arrived at Dropoff
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {status === "dropoff_inspection" && (
        <TouchableOpacity
          style={[
            styles.inspectionButton,
            { backgroundColor: theme.warning },
          ]}
          onPress={() =>
            handleStartInspection(
              workTracker.id,
              workTracker.bleacher_uuid,
              "dropoff",
            )
          }
        >
          <Text
            style={[styles.inspectionButtonText, { color: theme.onAccent }]}
          >
            Start Inspection
          </Text>
        </TouchableOpacity>
      )}

      {hasPostInspection && (
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
              View Dropoff Inspection
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
              title="Dropoff Inspection"
              onClose={() => setPostInspectionVisible(false)}
            />
          ) : null}
        </>
      )}

      <BillOfLading
        visible={bolVisible}
        workTracker={workTracker}
        onClose={() => setBolVisible(false)}
      />
    </Card>
  );
}

function tripItemPropsEqual(
  prev: TripItemProps,
  next: TripItemProps,
): boolean {
  return (
    prev.workTracker === next.workTracker &&
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
  card: {
    marginVertical: 6,
    marginHorizontal: 16,
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
  locationLabel: { ...typeScale.footnote, fontWeight: "700", letterSpacing: 0.5 },
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
  inspectionBlock: { marginTop: 12, gap: 10 },
  inspectionButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  inspectionButtonText: { ...typeScale.subhead, fontWeight: "600" },
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
