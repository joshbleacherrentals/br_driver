import BillOfLading, { BOLButton } from "@/components/widgets/billOfLading";
import BleacherDamageBadge from "@/components/widgets/bleacherDamageBadge";
import InspectionSummaryWidget from "@/components/widgets/inspectionSummaryWidget";
import { BRAND_BLUE } from "@/constants/Colors";
import { useAddress } from "@/hooks/db/useAddress";
import { useBleacher } from "@/hooks/db/useBleacher";
import { useDamageReports } from "@/hooks/db/useDamageReport";
import { useInspection } from "@/hooks/db/useInspection";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

interface CompletedTripProps {
  workTracker: WorkTracker;
  onClose: () => void;
}

export default function CompletedTrips({
  workTracker,
  onClose,
}: CompletedTripProps) {
  const { address: pickupAddress } = useAddress(
    workTracker.pickup_address_uuid,
  );
  const { address: dropoffAddress } = useAddress(
    workTracker.dropoff_address_uuid,
  );
  const { bleacher } = useBleacher(workTracker.bleacher_uuid);
  const { inspection: preInspection } = useInspection(
    workTracker.pre_inspection_uuid ?? null,
  );
  const { inspection: postInspection } = useInspection(
    workTracker.post_inspection_uuid ?? null,
  );
  const { damageReports } = useDamageReports(workTracker.bleacher_uuid);
  const [bolVisible, setBolVisible] = React.useState(false);

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

  const formatDateTime = (dateISO?: string | null) => {
    if (!dateISO) return "";
    try {
      if (dateISO.length === 10 && dateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateISO.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleString();
      }
      return new Date(dateISO).toLocaleString();
    } catch {
      return dateISO ?? "";
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* Title row: bleacher label + damage badge */}
            <View style={styles.titleRow}>
              <Text style={styles.title}>Completed Trip</Text>
            </View>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>
                {bleacher && `Bleacher #${bleacher.bleacher_number}`}
                {workTracker.bleacher_uuid && workTracker.pay_cents && " - "}
                {workTracker.pay_cents && formatPay(workTracker.pay_cents)}
              </Text>
              {damageReports.length > 0 && (
                <BleacherDamageBadge
                  damageReport={damageReports[0]}
                  bleacherNumber={bleacher?.bleacher_number}
                />
              )}
            </View>
            <Text style={styles.dateText}>{formatDate(workTracker.date)}</Text>
          </View>
          <View style={styles.badgeAndBol}>
            <View style={styles.completedBadge}>
              <Text style={styles.completedText}>COMPLETED</Text>
            </View>
            <BOLButton onPress={() => setBolVisible(true)} />
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
                  : undefined,
              )
            }
          >
            <Text style={styles.addressText}>
              {pickupAddress ? pickupAddress.street : "Address not set"}
            </Text>
          </TouchableOpacity>
          {workTracker.pickup_time && (
            <Text style={styles.detailText}>
              Time: {formatTime(workTracker.pickup_time)}
            </Text>
          )}
          {workTracker.pickup_poc && (
            <Text style={styles.detailText}>POC: {workTracker.pickup_poc}</Text>
          )}
          {workTracker.teardown_required !== null &&
            workTracker.teardown_required !== undefined && (
              <View style={styles.flagRow}>
                <Ionicons
                  name={
                    workTracker.teardown_required
                      ? "construct-outline"
                      : "checkmark-circle-outline"
                  }
                  size={14}
                  color={workTracker.teardown_required ? "#FF9500" : "#8E8E93"}
                />
                <Text
                  style={[
                    styles.flagText,
                    workTracker.teardown_required
                      ? styles.flagTextActive
                      : null,
                  ]}
                >
                  Tear Down Required:{" "}
                  {workTracker.teardown_required ? "Yes" : "No"}
                </Text>
              </View>
            )}
          {workTracker.pickup_instructions && (
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsLabel}>Pickup Instructions</Text>
              <Text style={styles.instructionsText}>
                {workTracker.pickup_instructions}
              </Text>
            </View>
          )}
        </View>

        {/* Pickup Inspection */}
        <InspectionSummaryWidget
          inspection={preInspection}
          damages={damageReports}
          title="Pickup Inspection"
          defaultExpanded={true}
        />

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
                  : undefined,
              )
            }
          >
            <Text style={styles.addressText}>
              {dropoffAddress ? dropoffAddress.street : "Address not set"}
            </Text>
          </TouchableOpacity>
          {workTracker.dropoff_time && (
            <Text style={styles.detailText}>
              Time: {formatTime(workTracker.dropoff_time)}
            </Text>
          )}
          {workTracker.dropoff_poc && (
            <Text style={styles.detailText}>
              POC: {workTracker.dropoff_poc}
            </Text>
          )}
          {workTracker.setup_required !== null &&
            workTracker.setup_required !== undefined && (
              <View style={styles.flagRow}>
                <Ionicons
                  name={
                    workTracker.setup_required
                      ? "construct-outline"
                      : "checkmark-circle-outline"
                  }
                  size={14}
                  color={workTracker.setup_required ? "#FF9500" : "#8E8E93"}
                />
                <Text
                  style={[
                    styles.flagText,
                    workTracker.setup_required ? styles.flagTextActive : null,
                  ]}
                >
                  Set Up Required: {workTracker.setup_required ? "Yes" : "No"}
                </Text>
              </View>
            )}
          {workTracker.dropoff_instructions && (
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsLabel}>
                Drop-off Instructions
              </Text>
              <Text style={styles.instructionsText}>
                {workTracker.dropoff_instructions}
              </Text>
            </View>
          )}
        </View>

        {/* Dropoff Inspection */}
        <InspectionSummaryWidget
          inspection={postInspection}
          damages={damageReports}
          title="Dropoff Inspection"
          defaultExpanded={true}
        />

        {/* Close */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>

        <BillOfLading
          visible={bolVisible}
          workTracker={workTracker}
          onClose={() => setBolVisible(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  badgeAndBol: { alignItems: "flex-end", marginLeft: 12 },
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  scrollContent: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerLeft: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#000" },
  subtitle: { fontSize: 18, fontWeight: "600", color: "#000" },
  dateText: { fontSize: 15, color: "#8E8E93", marginTop: 2 },
  completedBadge: {
    backgroundColor: "#8E8E93",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  completedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  notesBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 8,
  },
  notesText: { fontSize: 16, color: "#000" },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginBottom: 0,
  },
  timelineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  timelineLabel: { fontSize: 14, fontWeight: "500", color: "#8E8E93" },
  timelineValue: { fontSize: 14, fontWeight: "600", color: "#000" },
  addressText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A84FF",
    marginBottom: 8,
  },
  detailText: { fontSize: 14, color: "#8E8E93", marginTop: 4 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  flagText: { fontSize: 13, color: "#8E8E93" },
  flagTextActive: { color: "#FF9500", fontWeight: "600" },
  instructionsBox: {
    backgroundColor: "#F0F4FF",
    borderLeftWidth: 3,
    borderLeftColor: BRAND_BLUE,
    borderRadius: 6,
    padding: 10,
    marginTop: 10,
  },
  instructionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: BRAND_BLUE,
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  instructionsText: { fontSize: 13, color: "#1C1C1E", lineHeight: 18 },
  closeButton: {
    backgroundColor: "#0A84FF",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  closeButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
