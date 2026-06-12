import BleacherDamageBadge from "@/components/widgets/bleacherDamageBadge";
import { InspectionDetailModal } from "@/components/widgets/inspectionSummaryWidget";
import { BRAND_BLUE, GREEN_ACCENT } from "@/constants/Colors";
import { useAddress } from "@/hooks/db/useAddress";
import { useBleacher } from "@/hooks/db/useBleacher";
import { useDamageReports } from "@/hooks/db/useDamageReport";
import { useInspection } from "@/hooks/db/useInspection";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
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
import BleacherDropdown, { BleacherOption } from "./bleacherDropdown";

const themes = {
  light: {
    card: "#FFFFFF",
    cardBorder: "transparent",
    titleText: "#000000",
    dateText: "#8E8E93",
    divider: "#E5E7EB",
    notesBg: "#F8F8F8",
    notesLabel: "#888888",
    notesText: "#333333",
    locationLabel: "#000000",
    locationIcon: "#000000",
    timeText: "#000000",
    detailText: "#8E8E93",
    instructionsBg: "#F0F4FF",
    instructionsText: "#1C1C1E",
  },
  dark: {
    card: "#2C2C2E",
    cardBorder: "#3A3A3C",
    titleText: "#FFFFFF",
    dateText: "#8E8E93",
    divider: "#38383A",
    notesBg: "#2C2C2E",
    notesLabel: "#636366",
    notesText: "#EBEBF5",
    locationLabel: "#FFFFFF",
    locationIcon: "#FFFFFF",
    timeText: "#FFFFFF",
    detailText: "#8E8E93",
    instructionsBg: "#1A2A40",
    instructionsText: "#E5E5EA",
  },
};

interface TripItemProps {
  workTracker: WorkTracker;
  bleacherOptions?: BleacherOption[];
  onAccept?: (workTrackerId: string) => void;
  onStartTrip?: (workTrackerId: string) => void;
  onSkip?: (workTrackerId: string) => void;
  onArrived?: (workTrackerId: string, arrivedAt: string) => void;
  onStartInspection?: (
    workTrackerId: string,
    bleacherUuid: string | null,
    inspectionType: "pickup" | "dropoff",
  ) => void;
  onBleacherChange?: (workTrackerId: string, newBleacherUuid: string) => void;
}

export default function TripItem({
  workTracker,
  bleacherOptions = [],
  onAccept,
  onStartTrip,
  onSkip,
  onArrived,
  onStartInspection,
  onBleacherChange,
}: TripItemProps) {
  const colorScheme = useColorScheme();
  const t = themes[colorScheme === "dark" ? "dark" : "light"];
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
  const [selectedBleacherUuid, setSelectedBleacherUuid] =
    React.useState<string>(bleacher_uuid ?? "");
  const [preInspectionVisible, setPreInspectionVisible] = React.useState(false);
  const [postInspectionVisible, setPostInspectionVisible] =
    React.useState(false);

  const pickupAddressData = useAddress(pickup_address_uuid);
  const dropoffAddressData = useAddress(dropoff_address_uuid);
  const { bleacher } = useBleacher(bleacher_uuid);
  const { inspection: preInspection } = useInspection(
    workTracker.pre_inspection_uuid ?? null,
  );
  const { inspection: postInspection } = useInspection(
    workTracker.post_inspection_uuid ?? null,
  );

  // ── Damage report for the assigned bleacher ─────────────────────────────
  const { damageReports } = useDamageReports(bleacher_uuid);

  const pickupStreet = pickupAddressData.address?.street ?? null;

  const eligibleBleacherOptions = React.useMemo(() => {
    const currentRows = bleacher?.bleacher_rows ?? null;
    const currentUuid = bleacher_uuid ?? "";

    return bleacherOptions.filter((opt) => {
      if (opt.uuid === currentUuid) return true;
      if (
        currentRows !== null &&
        opt.bleacher_rows != null &&
        opt.bleacher_rows !== currentRows
      )
        return false;
      if (!opt.resolved_address || !pickupStreet) return false;
      if (
        opt.resolved_address.trim().toLowerCase() !==
        pickupStreet.trim().toLowerCase()
      )
        return false;
      return true;
    });
  }, [bleacherOptions, bleacher?.bleacher_rows, bleacher_uuid, pickupStreet]);

  if (status === "draft" || status === "completed") return null;

  const formatAddress = (type: "pickup" | "dropoff") => {
    const address =
      type === "pickup"
        ? pickupAddressData.address
        : dropoffAddressData.address;
    if (!address) return "Address not set";
    return `${address.street}`;
  };

  const formatPay = (cents: number | null) =>
    cents === null ? "" : `$${(cents / 100).toFixed(2)}`;

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

  const getStatusBadge = () => {
    switch (status) {
      case "released":
        return { text: "PENDING ACCEPTANCE", color: "#34C759" };
      case "accepted":
        return { text: "ACCEPTED", color: GREEN_ACCENT };
      case "dest_pickup":
        return { text: "EN ROUTE", color: "#FF9500" };
      case "pickup_inspection":
        return { text: "EN ROUTE", color: "#FF9500" };
      case "dest_dropoff":
        return { text: "EN ROUTE", color: "#FF9500" };
      case "dropoff_inspection":
        return { text: "EN ROUTE", color: "#FF9500" };
      case "completed":
        return { text: "COMPLETED", color: "#8E8E93" };
      case "cancelled":
        return { text: "CANCELLED", color: "#FF3B30" };
      default:
        return null;
    }
  };

  const badge = getStatusBadge();
  const showTeardown = teardown_required === 1;
  const showSetup = setup_required === 1;

  const handleBleacherChange = (uuid: string) => {
    const original = bleacher_uuid ?? "";
    if (uuid !== original) {
      Alert.alert(
        "Change Bleacher?",
        "This will update the bleacher assigned to this trip when you start the inspection. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: () => {
              setSelectedBleacherUuid(uuid);
              onBleacherChange?.(workTracker.id, uuid);
            },
          },
        ],
      );
    } else {
      setSelectedBleacherUuid(uuid);
      onBleacherChange?.(workTracker.id, uuid);
    }
  };

  const handleStartInspection = (
    id: string,
    bleacherUuid: string | null,
    type: "pickup" | "dropoff",
  ) => {
    onStartInspection?.(id, bleacherUuid, type);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.card, borderColor: t.cardBorder },
      ]}
    >
      {/* ── Top Header: Bleacher, Pay & damage badge ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.topHeader}>
          {/* Title row: bleacher number + damage badge inline */}
          <View style={styles.titleRow}>
            <Text style={[styles.mainTitle, { color: t.titleText }]}>
              {bleacher_uuid &&
                bleacher &&
                `Bleacher #${bleacher.bleacher_number} `}
              {damageReports.length > 0 && (
                <BleacherDamageBadge
                  damageReport={damageReports[0]}
                  bleacherNumber={bleacher?.bleacher_number}
                />
              )}
              {pay_cents !== null && formatPay(pay_cents)}
            </Text>
          </View>
          <Text style={[styles.dateText, { color: t.dateText }]}>
            {formatDate(date)}
          </Text>
        </View>
        {badge && (
          <View style={styles.badgeAndBol}>
            <View
              style={[styles.statusBadge, { backgroundColor: badge.color }]}
            >
              <Text style={styles.statusText}>{badge.text}</Text>
            </View>
            <BOLButton onPress={() => setBolVisible(true)} />
          </View>
        )}
      </View>

      {/* Notes */}
      {!!notes && (
        <View style={[styles.notesBox, { backgroundColor: t.notesBg }]}>
          <Text style={[styles.notesLabel, { color: t.notesLabel }]}>
            Notes
          </Text>
          <Text style={[styles.notesText, { color: t.notesText }]}>
            {notes}
          </Text>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: t.divider }]} />

      {/* ── PICKUP ── */}
      <View style={styles.stopSection}>
        <View style={styles.stopHeader}>
          <View style={styles.stopHeaderLeft}>
            <Ionicons name="location" size={16} color={t.locationIcon} />
            <Text style={[styles.locationLabel, { color: t.locationLabel }]}>
              PICKUP
            </Text>
          </View>
          {pickup_time && (
            <Text style={[styles.timeText, { color: t.timeText }]}>
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
          <Text style={styles.addressText}>{formatAddress("pickup")}</Text>
        </TouchableOpacity>

        {!!pickup_poc && (
          <Text style={[styles.detailText, { color: t.detailText }]}>
            POC: {pickup_poc}
          </Text>
        )}
        {showTeardown && (
          <View style={styles.flagRow}>
            <Ionicons name="construct-outline" size={14} color="#FF9500" />
            <Text style={[styles.flagText, styles.flagTextActive]}>
              Tear Down Required
            </Text>
          </View>
        )}
        {!!pickup_instructions && (
          <View
            style={[
              styles.instructionsBox,
              { backgroundColor: t.instructionsBg },
            ]}
          >
            <Text style={styles.instructionsLabel}>Pickup Instructions</Text>
            <Text
              style={[styles.instructionsText, { color: t.instructionsText }]}
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
            style={styles.primaryButton}
            onPress={() =>
              onArrived?.(workTracker.id, new Date().toISOString())
            }
          >
            <Text style={styles.primaryButtonText}>Arrived at Pickup</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Start Pickup Inspection */}
      {status === "pickup_inspection" && (
        <View style={styles.inspectionBlock}>
          <View style={styles.bleacherSelectorBox}>
            <Text style={styles.bleacherSelectorLabel}>Confirm Bleacher</Text>
            <BleacherDropdown
              options={eligibleBleacherOptions}
              selectedUuid={selectedBleacherUuid || bleacher_uuid}
              onChange={handleBleacherChange}
            />
          </View>
          <TouchableOpacity
            style={styles.inspectionButton}
            onPress={() =>
              handleStartInspection(
                workTracker.id,
                workTracker.bleacher_uuid,
                "pickup",
              )
            }
          >
            <Text style={styles.inspectionButtonText}>Start Inspection</Text>
          </TouchableOpacity>
        </View>
      )}

      {preInspection && (
        <>
          <TouchableOpacity
            style={styles.viewInspectionButton}
            onPress={() => setPreInspectionVisible(true)}
          >
            <Ionicons name="clipboard-outline" size={14} color="#34C759" />
            <Text style={styles.viewInspectionText}>
              View Pickup Inspection
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#34C759" />
          </TouchableOpacity>
          <InspectionDetailModal
            visible={preInspectionVisible}
            inspection={preInspection}
            damages={damageReports}
            title="Pickup Inspection"
            onClose={() => setPreInspectionVisible(false)}
          />
        </>
      )}

      <View style={[styles.divider, { backgroundColor: t.divider }]} />

      {/* ── DROP-OFF ── */}
      <View style={styles.stopSection}>
        <View style={styles.stopHeader}>
          <View style={styles.stopHeaderLeft}>
            <Ionicons name="location" size={16} color={t.locationIcon} />
            <Text style={[styles.locationLabel, { color: t.locationLabel }]}>
              DROP-OFF
            </Text>
          </View>
          {dropoff_time && (
            <Text style={[styles.timeText, { color: t.timeText }]}>
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
          <Text style={styles.addressText}>{formatAddress("dropoff")}</Text>
        </TouchableOpacity>

        {!!dropoff_poc && (
          <Text style={[styles.detailText, { color: t.detailText }]}>
            POC: {dropoff_poc}
          </Text>
        )}
        {showSetup && (
          <View style={styles.flagRow}>
            <Ionicons name="construct-outline" size={14} color="#FF9500" />
            <Text style={[styles.flagText, styles.flagTextActive]}>
              Set Up Required
            </Text>
          </View>
        )}
        {!!dropoff_instructions && (
          <View
            style={[
              styles.instructionsBox,
              { backgroundColor: t.instructionsBg },
            ]}
          >
            <Text style={styles.instructionsLabel}>Drop-off Instructions</Text>
            <Text
              style={[styles.instructionsText, { color: t.instructionsText }]}
            >
              {dropoff_instructions}
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      {status === "released" && (
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => onAccept?.(workTracker.id)}
        >
          <Text style={styles.acceptButtonText}>Accept Trip</Text>
        </TouchableOpacity>
      )}
      {status === "accepted" && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onStartTrip?.(workTracker.id)}
          >
            <Text style={styles.primaryButtonText}>Start Trip</Text>
          </TouchableOpacity>
        </View>
      )}
      {status === "dest_dropoff" && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              onArrived?.(workTracker.id, new Date().toISOString())
            }
          >
            <Text style={styles.primaryButtonText}>Arrived at Dropoff</Text>
          </TouchableOpacity>
        </View>
      )}
      {status === "dropoff_inspection" && (
        <TouchableOpacity
          style={styles.inspectionButton}
          onPress={() =>
            handleStartInspection(
              workTracker.id,
              workTracker.bleacher_uuid,
              "dropoff",
            )
          }
        >
          <Text style={styles.inspectionButtonText}>Start Inspection</Text>
        </TouchableOpacity>
      )}

      {postInspection && (
        <>
          <TouchableOpacity
            style={styles.viewInspectionButton}
            onPress={() => setPostInspectionVisible(true)}
          >
            <Ionicons name="clipboard-outline" size={14} color="#34C759" />
            <Text style={styles.viewInspectionText}>
              View Dropoff Inspection
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#34C759" />
          </TouchableOpacity>
          <InspectionDetailModal
            visible={postInspectionVisible}
            inspection={postInspection}
            damages={damageReports}
            title="Dropoff Inspection"
            onClose={() => setPostInspectionVisible(false)}
          />
        </>
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
  badgeAndBol: { alignItems: "flex-end", flexShrink: 0 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
  mainTitle: { fontSize: 24, fontWeight: "700" },
  dateText: { fontSize: 15, fontWeight: "500" },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  notesBox: { borderRadius: 8, padding: 12, marginBottom: 12 },
  notesLabel: { fontSize: 12, marginBottom: 4, fontWeight: "500" },
  notesText: { fontSize: 14 },
  divider: { height: 1, marginVertical: 12 },
  stopSection: { marginBottom: 8 },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stopHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationLabel: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  timeText: { fontSize: 15, fontWeight: "600" },
  addressText: {
    fontSize: 15,
    fontWeight: "600",
    color: BRAND_BLUE,
    marginBottom: 4,
  },
  detailText: { fontSize: 13, marginTop: 2 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  flagText: { fontSize: 13, color: "#8E8E93" },
  flagTextActive: { color: "#FF9500", fontWeight: "600" },
  instructionsBox: {
    borderLeftWidth: 3,
    borderLeftColor: BRAND_BLUE,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  instructionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: BRAND_BLUE,
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  instructionsText: { fontSize: 13, lineHeight: 18 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  primaryButton: {
    flex: 2,
    backgroundColor: BRAND_BLUE,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  acceptButton: {
    backgroundColor: "#34C759",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  acceptButtonText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  inspectionBlock: { marginTop: 12, gap: 10 },
  bleacherSelectorBox: { gap: 6 },
  bleacherSelectorLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  inspectionButton: {
    backgroundColor: "#FF9500",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  inspectionButtonText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  viewInspectionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#34C759",
    alignSelf: "flex-start",
    marginTop: 10,
  },
  viewInspectionText: { fontSize: 13, fontWeight: "600", color: "#34C759" },
});
