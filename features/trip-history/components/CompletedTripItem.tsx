import StopRosterHeading from "@/components/widgets/trip/StopRosterHeading";
import Badge from "@/components/ui/Badge";
import BillOfLading, { BOLButton } from "@/components/widgets/billOfLading";
import { PayAmount } from "@/components/widgets/payBreakdown";
import BleacherDamageBadge from "@/components/widgets/bleacherDamageBadge";
import { getEffectiveBleacherUuid } from "@/utils/effectiveBleacher";
import InspectionSummaryWidget from "@/components/widgets/inspectionSummaryWidget";
import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useBleacher } from "@/hooks/db/useBleacher";
import { useDamageReports } from "@/hooks/db/useDamageReport";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { useTripHistoryDetails } from "@/features/trip-history/hooks/useTripHistoryDetails";
import { useWorkTrackerKind } from "@/hooks/db/useWorkTrackerTypes";
import WorkTrackerKindBadge from "@/components/widgets/trip/WorkTrackerKindBadge";
import { buildTripStops, type TripStop } from "@/utils/tripStops";
import { tripHasInspections } from "@/utils/workTrackerKind";
import { useTheme } from "@/hooks/useTheme";
import { ContactButton } from "@/components/widgets/contactSheet";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemedStyles } from "@/hooks/useThemedStyles";
const STOP_HEADING: Record<TripStop["key"], string> = {
  pickup: "Pickup Location",
  dropoff: "Dropoff Location",
  single: "Location",
};

const STOP_INSPECTION_TITLE: Record<TripStop["key"], string> = {
  pickup: "Pickup Inspection",
  dropoff: "Dropoff Inspection",
  single: "Inspection",
};

const FLOATING_HEADER_HEIGHT = 52;
const FLOATING_HEADER_GAP = 12;

interface CompletedTripProps {
  workTracker: WorkTracker;
  onClose: () => void;
}

export default function CompletedTrips({
  workTracker,
  onClose,
}: CompletedTripProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const headerScrollInset =
    FLOATING_HEADER_GAP + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_GAP;

  // A finished trip's addresses, pay and inspections come from its snapshot —
  // those rows stop syncing once the trip is done.
  const {
    pickupAddress,
    dropoffAddress,
    lineItems,
    preInspection,
    postInspection,
  } = useTripHistoryDetails(workTracker);
  // The bleacher actually hauled, not the one originally assigned.
  const effectiveBleacherUuid = getEffectiveBleacherUuid(workTracker);
  const { bleacher } = useBleacher(effectiveBleacherUuid);
  const { damageReports } = useDamageReports(effectiveBleacherUuid);
  const kind = useWorkTrackerKind(workTracker.work_tracker_type_uuid);
  const inspects = tripHasInspections(kind);
  const stops = buildTripStops({
    kind,
    workTracker,
    pickupAddress,
    dropoffAddress,
  });
  const [bolVisible, setBolVisible] = React.useState(false);

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

  const bleacherLabel = bleacher
    ? `Bleacher #${bleacher.bleacher_number}`
    : "Completed Trip";

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + headerScrollInset },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroMain}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{bleacherLabel}</Text>
              {damageReports.length > 0 && (
                <BleacherDamageBadge
                  damageReport={damageReports[0]}
                  bleacherNumber={bleacher?.bleacher_number}
                />
              )}
            </View>
            <Text style={styles.heroDate}>{formatDate(workTracker.date)}</Text>
            <View style={styles.heroKindRow}>
              <WorkTrackerKindBadge kind={kind} theme={theme} />
            </View>
            <View style={styles.heroPayRow}>
              <PayAmount
                workTrackerId={workTracker.id}
                payCents={workTracker.pay_cents}
                lineItems={lineItems}
              />
            </View>
          </View>
          <View style={styles.heroActions}>
            <Badge
              label="Completed"
              color={theme.success}
              icon="checkmark-circle"
            />
            <BOLButton onPress={() => setBolVisible(true)} />
          </View>
        </View>

        {workTracker.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Trip Notes</Text>
            <Text style={styles.cardBody}>{workTracker.notes}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Trip Timeline</Text>
          {workTracker.accepted_at ? (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Accepted</Text>
              <Text style={styles.timelineValue}>
                {formatDateTime(workTracker.accepted_at)}
              </Text>
            </View>
          ) : null}
          {workTracker.started_at ? (
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Started</Text>
              <Text style={styles.timelineValue}>
                {formatDateTime(workTracker.started_at)}
              </Text>
            </View>
          ) : null}
          {workTracker.completed_at ? (
            <View style={[styles.timelineItem, styles.timelineItemLast]}>
              <Text style={styles.timelineLabel}>Completed</Text>
              <Text style={styles.timelineValue}>
                {formatDateTime(workTracker.completed_at)}
              </Text>
            </View>
          ) : null}
        </View>

        {stops.map((stop) => {
          // A trip has a pick-up leg with its own inspection and a drop-off
          // leg with another. A repair or a site visit has one of each, and
          // the office writes it into the drop-off columns — so the single
          // stop reads its inspection from `post_inspection_uuid` too.
          const isPickup = stop.key === "pickup";
          const inspection = isPickup ? preInspection : postInspection;
          const teardownFlag = isPickup ? workTracker.teardown_required : null;
          const setupFlag =
            stop.key === "dropoff" ? workTracker.setup_required : null;
          const flagValue = isPickup ? teardownFlag : setupFlag;
          const flagLabel = isPickup ? "Tear Down Required" : "Set Up Required";

          return (
            <View key={stop.key} style={styles.group}>
              <View style={[styles.card, styles.cardGroupedTop]}>
                <View style={styles.cardTitleRow}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={theme.accent}
                  />
                  <StopRosterHeading
                    title={STOP_HEADING[stop.key]}
                    leg={isPickup ? "pickup" : "dropoff"}
                    eventUuid={
                      isPickup
                        ? workTracker.pickup_event_uuid
                        : workTracker.dropoff_event_uuid
                    }
                    workTrackerId={workTracker.id}
                    textStyle={styles.cardHeadingInline}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => openInMaps(stop.mapsQuery ?? undefined)}
                >
                  <Text style={styles.addressText}>{stop.address}</Text>
                </TouchableOpacity>
                {stop.time ? (
                  <Text style={styles.detailText}>Time: {stop.time}</Text>
                ) : null}
                {stop.poc ? (
                  <Text style={styles.detailText}>POC: {stop.poc}</Text>
                ) : null}
                <ContactButton
                  contactId={stop.contactUuid}
                  status={workTracker.status}
                  acceptedAt={workTracker.accepted_at}
                />
                {flagValue !== null && flagValue !== undefined ? (
                  <View style={styles.flagRow}>
                    <Ionicons
                      name={
                        flagValue
                          ? "construct-outline"
                          : "checkmark-circle-outline"
                      }
                      size={14}
                      color={flagValue ? theme.warning : theme.textTertiary}
                    />
                    <Text
                      style={[
                        styles.flagText,
                        flagValue ? styles.flagTextActive : null,
                      ]}
                    >
                      {flagLabel}: {flagValue ? "Yes" : "No"}
                    </Text>
                  </View>
                ) : null}
                {stop.instructions ? (
                  <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsLabel}>
                      {stop.instructionsLabel}
                    </Text>
                    <Text style={styles.instructionsText}>
                      {stop.instructions}
                    </Text>
                  </View>
                ) : null}
              </View>

              {inspects ? (
                <InspectionSummaryWidget
                  inspection={inspection}
                  damages={damageReports}
                  title={STOP_INSPECTION_TITLE[stop.key]}
                  defaultExpanded={true}
                  embedded
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.headerOverlay,
          { paddingTop: insets.top + FLOATING_HEADER_GAP },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.floatingHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityLabel="Back to trip history"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Trip Details
          </Text>
          <View style={styles.headerSide} />
        </View>
      </View>

      <BillOfLading
        visible={bolVisible}
        workTracker={workTracker}
        onClose={() => setBolVisible(false)}
      />
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    headerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      backgroundColor: "transparent",
      zIndex: 10,
    },
    floatingHeader: {
      flexDirection: "row",
      alignItems: "center",
      height: FLOATING_HEADER_HEIGHT,
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      paddingHorizontal: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "floating"),
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      ...typeScale.body,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    headerSide: { width: 40 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 12,
    },
    hero: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 4,
    },
    heroMain: { flex: 1, minWidth: 0 },
    heroTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    heroTitle: {
      ...typeScale.title2,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    heroDate: {
      ...typeScale.subhead,
      color: theme.textSecondary,
      marginTop: 4,
    },
    heroKindRow: { marginTop: 8 },
    heroPayRow: { alignSelf: "flex-start", marginTop: 4 },
    heroActions: {
      alignItems: "flex-end",
      gap: 8,
      flexShrink: 0,
    },
    group: { gap: 0 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    cardGroupedTop: {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomWidth: 0,
    },
    cardHeading: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.textPrimary,
      marginBottom: 12,
    },
    cardHeadingInline: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    cardLabel: {
      ...typeScale.footnote,
      fontWeight: "600",
      color: theme.textTertiary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    cardBody: {
      ...typeScale.subhead,
      color: theme.textPrimary,
      lineHeight: 22,
    },
    timelineItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    timelineItemLast: { borderBottomWidth: 0, paddingBottom: 0 },
    timelineLabel: {
      ...typeScale.subhead,
      fontWeight: "400",
      color: theme.textSecondary,
    },
    timelineValue: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
      textAlign: "right",
      flexShrink: 1,
    },
    addressText: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.accent,
      lineHeight: 21,
    },
    detailText: {
      ...typeScale.footnote,
      color: theme.textSecondary,
      marginTop: 8,
    },
    flagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 10,
    },
    flagText: { ...typeScale.footnote, color: theme.textSecondary },
    flagTextActive: { color: theme.warning, fontWeight: "600" },
    instructionsBox: {
      backgroundColor: theme.accentSoft,
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
      borderRadius: radius.control,
      padding: 12,
      marginTop: 12,
    },
    instructionsLabel: {
      ...typeScale.caption2,
      fontWeight: "700",
      color: theme.accent,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    instructionsText: {
      ...typeScale.footnote,
      color: theme.textPrimary,
      lineHeight: 18,
    },
  });
}
