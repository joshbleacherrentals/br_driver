import { db } from "@/components/providers/SystemProvider";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import {
  BRAND_BLUE,
  SCREEN_BG_DARK,
  SCREEN_BG_LIGHT,
} from "@/constants/Colors";
import AvailabilityIntroStrip from "@/features/availability/components/AvailabilityIntroStrip";
import UpcomingTripCard from "@/features/availability/components/UpcomingTripCard";
import { useDriver } from "@/hooks/db/useDriver";
import { useDriverUnavailability } from "@/hooks/db/useDriverUnavailability";
import { useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { randomUUID } from "expo-crypto";
import { Menu } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";

// ─── Constants ────────────────────────────────────────────────────────────────

const MID_BLUE = "#164d82";

// ─── Themes ───────────────────────────────────────────────────────────────────

const themes = {
  light: {
    bg: SCREEN_BG_LIGHT,
    calendarBg: "#F8F9FA",
    calendarBorder: "#E5E7EB",
    legendText: "#6B7280",
    sectionCount: "#6B7280",
    saveBtnCleanBg: "#e5e7eb",
    saveBtnCleanText: "#6b7280",
    discardBtnBg: "#f3f4f6",
    discardBtnIcon: "#6b7280",
    menuIcon: "#111827",
    statusAvailText: "#14532d",
    statusUnavailText: "#991b1b",
    clearText: "#dc2626",
  },
  dark: {
    bg: SCREEN_BG_DARK,
    calendarBg: "#1C1C1E",
    calendarBorder: "#2C2C2E",
    legendText: "#7fb3d3",
    sectionCount: "#4a6f96",
    saveBtnCleanBg: "#374151",
    saveBtnCleanText: "#9ca3af",
    discardBtnBg: "#374151",
    discardBtnIcon: "#9ca3af",
    menuIcon: "#FFFFFF",
    statusAvailText: "#86efac",
    statusUnavailText: "#fca5a5",
    clearText: "#fca5a5",
  },
};

const SAVED_RED = "#EF4444";
const PENDING_COLOR = "#F97316";

const TODAY_BLUE = "#3B82F6";
const SUCCESS_GREEN = "#34C759";
const DOT_UPCOMING = "#FBBF24";
const DOT_COMPLETED = "#34C759";

const TODAY = new Date().toISOString().split("T")[0];

const UPCOMING_STATUSES = new Set([
  "released",
  "accepted",
  "dest_pickup",
  "pickup_inspection",
  "dest_dropoff",
  "dropoff_inspection",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type DotEntry = { key: string; color: string };
type MarkedDate = {
  selected?: boolean;
  selectedColor?: string;
  selectedTextColor?: string;
  dots?: DotEntry[];
};
type MarkedDates = { [date: string]: MarkedDate };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonthName(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function isPastDate(dateStr: string): boolean {
  return dateStr < TODAY;
}

function formatStatus(status: string | null): string {
  if (!status) return "Pending";
  const map: Record<string, string> = {
    released: "Released",
    accepted: "Accepted",
    dest_pickup: "En Route",
    pickup_inspection: "At Pickup",
    dest_dropoff: "To Dropoff",
    dropoff_inspection: "At Dropoff",
  };
  return map[status] ?? status;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AvailabilityCalendarScreen() {
  const navigation = useNavigation<any>();
  const openDrawer = () => navigation.dispatch(DrawerActions.openDrawer());
  const colorScheme = useColorScheme();
  const t = themes[colorScheme === "dark" ? "dark" : "light"];

  const [currentMonth, setCurrentMonth] = useState(TODAY.substring(0, 7));
  const [isSaving, setIsSaving] = useState(false);

  // ── Undo stack — snapshots of localUnavailable before destructive ops ────────
  const [undoStack, setUndoStack] = useState<Set<string>[]>([]);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushUndo = useCallback((snapshot: Set<string>) => {
    setUndoStack((prev) => [...prev.slice(-9), new Set(snapshot)]);
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const snapshot = next.pop()!;
      setLocalUnavailable(snapshot);
      return next;
    });
    setUndoToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const showUndoToast = useCallback((message: string) => {
    setUndoToast(message);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 4000);
  }, []);

  // ── DB data ──────────────────────────────────────────────────────────────────
  const { driver } = useDriver();
  const { workTrackers } = useWorkTrackers();
  const { unavailableDates: dbUnavailableDates } = useDriverUnavailability();

  // ── Local state ───────────────────────────────────────────────────────────────
  const [localUnavailable, setLocalUnavailable] = useState<Set<string>>(
    new Set(),
  );
  const dbInitialised = useRef(false);

  useEffect(() => {
    if (dbUnavailableDates && !dbInitialised.current) {
      const dbSet = new Set(
        dbUnavailableDates
          .map((r) => r.date_unavailable)
          .filter((d): d is string => !!d),
      );
      setLocalUnavailable(dbSet);
      dbInitialised.current = true;
    }
  }, [dbUnavailableDates]);

  const dbSavedSet = useMemo(
    () =>
      new Set(
        (dbUnavailableDates ?? [])
          .map((r) => r.date_unavailable)
          .filter((d): d is string => !!d),
      ),
    [dbUnavailableDates],
  );

  const hasPendingChanges = useMemo(() => {
    for (const d of localUnavailable) {
      if (!dbSavedSet.has(d)) return true;
    }
    for (const d of dbSavedSet) {
      if (!localUnavailable.has(d)) return true;
    }
    return false;
  }, [localUnavailable, dbSavedSet]);

  const pendingAdd = useMemo(
    () => new Set([...localUnavailable].filter((d) => !dbSavedSet.has(d))),
    [localUnavailable, dbSavedSet],
  );
  const pendingRemove = useMemo(
    () => new Set([...dbSavedSet].filter((d) => !localUnavailable.has(d))),
    [localUnavailable, dbSavedSet],
  );

  // ── Trip data ─────────────────────────────────────────────────────────────────
  const tripDotsByDate = useMemo(() => {
    const map: Record<string, { upcoming: boolean; completed: boolean }> = {};
    for (const t of workTrackers ?? []) {
      if (!t.date) continue;
      if (!map[t.date]) map[t.date] = { upcoming: false, completed: false };
      if (t.status === "completed") map[t.date].completed = true;
      else if (t.status && UPCOMING_STATUSES.has(t.status))
        map[t.date].upcoming = true;
    }
    return map;
  }, [workTrackers]);

  const upcomingTrips = useMemo(
    () =>
      (workTrackers ?? [])
        .filter((t) => t.date && t.status && UPCOMING_STATUSES.has(t.status))
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [workTrackers],
  );

  // ── markedDates ───────────────────────────────────────────────────────────────
  const markedDates = useMemo<MarkedDates>(() => {
    const result: MarkedDates = {};
    const ensure = (d: string) => {
      if (!result[d]) result[d] = { dots: [] };
    };

    ensure(TODAY);
    (result[TODAY].dots ??= []).push({ key: "today", color: TODAY_BLUE });

    for (const [date, { upcoming, completed }] of Object.entries(
      tripDotsByDate,
    )) {
      ensure(date);
      const dots = (result[date].dots ??= []);
      if (upcoming) dots.push({ key: "trip", color: DOT_UPCOMING });
      else if (completed) dots.push({ key: "trip", color: DOT_COMPLETED });
    }

    localUnavailable.forEach((date) => {
      ensure(date);
      const isSaved = dbSavedSet.has(date);
      result[date] = {
        ...result[date],
        selected: true,
        selectedColor: isSaved ? SAVED_RED : PENDING_COLOR,
        selectedTextColor: "#FFFFFF",
      };
    });

    return result;
  }, [tripDotsByDate, localUnavailable, dbSavedSet]);

  // ── Month-scoped helpers ──────────────────────────────────────────────────────
  const datesInCurrentMonth = useCallback(
    (set: Set<string>) =>
      Array.from(set).filter(
        (d) => d.startsWith(currentMonth) && !isPastDate(d),
      ),
    [currentMonth],
  );

  const unavailableThisMonth = datesInCurrentMonth(localUnavailable);
  const futureCountThisMonth = unavailableThisMonth.length;
  const pendingAddThisMonth = datesInCurrentMonth(pendingAdd).length;

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleDayPress = useCallback((day: DateData) => {
    if (isPastDate(day.dateString)) {
      Alert.alert(
        "Past Date",
        "You cannot modify availability for past dates.",
      );
      return;
    }
    setLocalUnavailable((prev) => {
      const next = new Set(prev);
      next.has(day.dateString)
        ? next.delete(day.dateString)
        : next.add(day.dateString);
      return next;
    });
  }, []);

  const handleClearMonth = useCallback(() => {
    const toRemove = datesInCurrentMonth(localUnavailable);
    if (!toRemove.length) return;
    Alert.alert(
      "Clear Month",
      `Remove all ${toRemove.length} unavailable date${toRemove.length > 1 ? "s" : ""} for ${formatMonthName(currentMonth)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            pushUndo(localUnavailable); // snapshot before clearing
            setLocalUnavailable((prev) => {
              const next = new Set(prev);
              toRemove.forEach((d) => next.delete(d));
              return next;
            });
            showUndoToast(
              `Cleared ${toRemove.length} date${toRemove.length > 1 ? "s" : ""} — tap Undo to restore`,
            );
          },
        },
      ],
    );
  }, [
    localUnavailable,
    currentMonth,
    datesInCurrentMonth,
    pushUndo,
    showUndoToast,
  ]);

  // ── Discard all local changes, revert to last saved DB state ─────────────────
  const handleDiscard = useCallback(() => {
    if (!hasPendingChanges) return;
    Alert.alert(
      "Discard Changes",
      "Revert all unsaved changes and restore your last saved availability?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            pushUndo(localUnavailable); // allow undo of the discard too
            setLocalUnavailable(new Set(dbSavedSet));
            showUndoToast("Changes discarded — tap Undo to restore");
          },
        },
      ],
    );
  }, [
    hasPendingChanges,
    localUnavailable,
    dbSavedSet,
    pushUndo,
    showUndoToast,
  ]);

  // ── Save to DB ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!hasPendingChanges) return;

    const driverUuid = driver?.id;
    if (!driverUuid) {
      Alert.alert(
        "Error",
        "Could not determine your driver profile. Please try again.",
      );
      return;
    }

    setIsSaving(true);
    try {
      const toAdd = [...pendingAdd];
      const toRemove = [...pendingRemove];

      // INSERT new rows — only send columns that exist on the table.
      // Do NOT include updated_at or created_at: the DB triggers set these
      // automatically. Sending them causes the PowerSync upload error:
      //   "record new has no field created_at"
      for (const date of toAdd) {
        const query = db
          .insertInto("DriverUnavailability")
          .values({
            id: randomUUID(),
            driver_uuid: driverUuid,
            date_unavailable: date,
            updated_at: new Date().toISOString(),
          })
          .compile();
        await executeTypedMutationVoid(query);
      }

      // DELETE removed rows by their DB id
      for (const date of toRemove) {
        const row = dbUnavailableDates?.find(
          (r) => r.date_unavailable === date,
        );
        if (!row) continue;
        const query = db
          .deleteFrom("DriverUnavailability")
          .where("id", "=", row.id)
          .compile();
        await executeTypedMutationVoid(query);
      }

      // Allow the useEffect to re-sync from fresh DB data after the upload settles
      dbInitialised.current = false;
    } catch (err) {
      console.error("Error saving availability:", err);
      Alert.alert("Error", "Failed to save availability. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [
    hasPendingChanges,
    pendingAdd,
    pendingRemove,
    dbUnavailableDates,
    driver,
  ]);

  // ─── Header right: save/discard buttons + hamburger menu ───────────────────
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginRight: 16,
          }}
        >
          {hasPendingChanges && (
            <TouchableOpacity
              style={[
                styles.headerDiscardBtn,
                { backgroundColor: t.discardBtnBg },
              ]}
              onPress={handleDiscard}
              activeOpacity={0.7}
            >
              <Ionicons
                name="close-circle-outline"
                size={18}
                color={t.discardBtnIcon}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.headerSaveBtn,
              hasPendingChanges
                ? styles.headerSaveBtnDirty
                : { backgroundColor: t.saveBtnCleanBg },
            ]}
            onPress={handleSave}
            disabled={!hasPendingChanges || isSaving}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.headerSaveBtnText,
                !hasPendingChanges && { color: t.saveBtnCleanText },
              ]}
            >
              {isSaving ? "Saving…" : hasPendingChanges ? "Save" : "Saved ✓"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openDrawer} activeOpacity={0.7}>
            <Menu size={24} color={t.menuIcon} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [
    navigation,
    openDrawer,
    hasPendingChanges,
    isSaving,
    handleSave,
    handleDiscard,
    colorScheme,
  ]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  const monthLabel = formatMonthName(currentMonth);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ProfileCompletionBanner />
      <DocExpiryWarningBanner />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro strip */}
        <AvailabilityIntroStrip />

        {/* Status banner */}
        <View
          style={[
            styles.statusBanner,
            futureCountThisMonth > 0
              ? styles.statusUnavail
              : styles.statusAvail,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  futureCountThisMonth > 0 ? SAVED_RED : SUCCESS_GREEN,
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              {
                color:
                  futureCountThisMonth > 0
                    ? t.statusUnavailText
                    : t.statusAvailText,
              },
            ]}
          >
            {futureCountThisMonth === 0
              ? `Available all of ${monthLabel}`
              : `${futureCountThisMonth} day${futureCountThisMonth > 1 ? "s" : ""} unavailable in ${monthLabel}`}
            {pendingAddThisMonth > 0 ? ` · ${pendingAddThisMonth} unsaved` : ""}
          </Text>
          {futureCountThisMonth > 0 && (
            <TouchableOpacity
              onPress={handleClearMonth}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.clearText, { color: t.clearText }]}>
                Clear month
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Calendar */}
        <View style={[styles.calendarCard, { borderColor: t.calendarBorder }]}>
          <Calendar
            key={colorScheme}
            current={currentMonth + "-01"}
            onDayPress={handleDayPress}
            onMonthChange={(month: DateData) =>
              setCurrentMonth(month.dateString.substring(0, 7))
            }
            markedDates={markedDates}
            markingType="multi-dot"
            minDate={TODAY}
            hideExtraDays
            enableSwipeMonths
            theme={{
              backgroundColor: t.calendarBg,
              calendarBackground: t.calendarBg,
              monthTextColor: colorScheme === "dark" ? "#FFFFFF" : "#111827",
              textMonthFontSize: 16,
              textMonthFontWeight: "700",
              arrowColor: colorScheme === "dark" ? "#93c5fd" : BRAND_BLUE,
              textSectionTitleColor:
                colorScheme === "dark" ? "#7fb3d3" : "#6B7280",
              textDayHeaderFontSize: 12,
              textDayHeaderFontWeight: "600",
              dayTextColor: colorScheme === "dark" ? "#FFFFFF" : "#111827",
              textDayFontSize: 14,
              textDayFontWeight: "500",
              todayTextColor: TODAY_BLUE,
              todayBackgroundColor: TODAY_BLUE + "25",
              selectedDayBackgroundColor: SAVED_RED,
              selectedDayTextColor: "#FFFFFF",
              textDisabledColor: colorScheme === "dark" ? "#4a6f96" : "#C7C7CC",
            }}
          />
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <LegendItem
            color={SAVED_RED}
            label="Unavailable (saved)"
            shape="square"
            textColor={t.legendText}
          />
          <LegendItem
            color={PENDING_COLOR}
            label="Unsaved"
            shape="square"
            textColor={t.legendText}
          />
          <LegendItem
            color={DOT_UPCOMING}
            label="Upcoming trip"
            shape="dot"
            textColor={t.legendText}
          />
          <LegendItem
            color={DOT_COMPLETED}
            label="Completed"
            shape="dot"
            textColor={t.legendText}
          />
        </View>

        {/* Upcoming Trips */}
        {upcomingTrips.length > 0 && (
          <View style={styles.listSection}>
            <View style={styles.listSectionHeader}>
              <View
                style={[
                  styles.sectionPill,
                  {
                    backgroundColor: DOT_UPCOMING + "22",
                    borderColor: DOT_UPCOMING + "55",
                  },
                ]}
              >
                <View
                  style={[
                    styles.sectionPillDot,
                    { backgroundColor: DOT_UPCOMING },
                  ]}
                />
                <Text style={[styles.sectionPillText, { color: DOT_UPCOMING }]}>
                  Upcoming Trips
                </Text>
              </View>
              <Text style={[styles.sectionCount, { color: t.sectionCount }]}>
                {upcomingTrips.length}
              </Text>
            </View>

            {upcomingTrips.map((trip) => {
              const conflictDate = !!(
                trip.date && localUnavailable.has(trip.date)
              );
              return (
                <UpcomingTripCard
                  key={trip.id}
                  trip={trip}
                  conflictDate={conflictDate}
                />
              );
            })}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Undo toast — floats above content, auto-dismisses after 4s */}
      {undoToast !== null && (
        <View style={styles.undoToast} pointerEvents="box-none">
          <Text style={styles.undoToastText} numberOfLines={2}>
            {undoToast}
          </Text>
          <TouchableOpacity
            onPress={handleUndo}
            style={styles.undoToastBtn}
            activeOpacity={0.8}
            disabled={undoStack.length === 0}
          >
            <Text style={styles.undoToastBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LegendItem({
  color,
  label,
  shape,
  textColor,
}: {
  color: string;
  label: string;
  shape: "dot" | "square";
  textColor: string;
}) {
  return (
    <View style={styles.legendItem}>
      {shape === "dot" ? (
        <View style={[styles.legendDot, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      )}
      <Text style={[styles.legendLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { width: 45, height: 45 },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#111827",
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
  headerSaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 50,
    alignItems: "center",
  },
  headerSaveBtnDirty: {
    backgroundColor: PENDING_COLOR,
  },
  headerSaveBtnClean: {
    backgroundColor: "#e5e7eb",
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSaveBtnTextClean: {
    color: "#6b7280",
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  introStrip: {
    // kept for reference — moved to AvailabilityIntroStrip component
  },
  introText: { fontSize: 13, fontWeight: "500", flex: 1 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  statusAvail: { backgroundColor: "#14532d30", borderColor: "#22c55e30" },
  statusUnavail: { backgroundColor: "#7f1d1d30", borderColor: "#ef444430" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: "600", flex: 1 },
  clearText: {
    fontSize: 12,
    color: "#fca5a5",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  calendarCard: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1e5799",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { fontSize: 12, color: "#7fb3d3", fontWeight: "500" },
  listSection: { marginBottom: 16 },
  listSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  sectionPillDot: { width: 6, height: 6, borderRadius: 3 },
  sectionPillText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: { fontSize: 13, color: "#4a6f96", fontWeight: "600" },

  // ── Header actions cluster ──
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerDiscardBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },

  // ── Undo toast ──
  undoToast: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  undoToastText: {
    flex: 1,
    fontSize: 13,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  undoToastBtn: {
    backgroundColor: PENDING_COLOR,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  undoToastBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
