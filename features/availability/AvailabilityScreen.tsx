import { db } from "@/components/providers/SystemProvider";
import Badge from "@/components/ui/Badge";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import { type ThemeColors, elevation, typeScale } from "@/constants/theme";
import AvailabilityIntroStrip from "@/features/availability/components/AvailabilityIntroStrip";
import UpcomingTripCard from "@/features/availability/components/UpcomingTripCard";
import { useDriver } from "@/hooks/db/useDriver";
import { useDriverUnavailability } from "@/hooks/db/useDriverUnavailability";
import { useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
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

import { useThemedStyles } from "@/hooks/useThemedStyles";
const TODAY = new Date().toISOString().split("T")[0];

const UPCOMING_STATUSES = new Set([
  "released",
  "accepted",
  "dest_pickup",
  "pickup_inspection",
  "dest_dropoff",
  "dropoff_inspection",
]);

type DotEntry = { key: string; color: string };
type MarkedDate = {
  selected?: boolean;
  selectedColor?: string;
  selectedTextColor?: string;
  dots?: DotEntry[];
};
type MarkedDates = { [date: string]: MarkedDate };

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

export default function AvailabilityCalendarScreen() {
  const navigation = useNavigation<any>();
  const openDrawer = () => navigation.dispatch(DrawerActions.openDrawer());
  const { theme, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [currentMonth, setCurrentMonth] = useState(TODAY.substring(0, 7));
  const [isSaving, setIsSaving] = useState(false);

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

  const { driver } = useDriver();
  const { workTrackers } = useWorkTrackers();
  const { unavailableDates: dbUnavailableDates } = useDriverUnavailability();

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

  const markedDates = useMemo<MarkedDates>(() => {
    const result: MarkedDates = {};
    const ensure = (d: string) => {
      if (!result[d]) result[d] = { dots: [] };
    };

    ensure(TODAY);
    (result[TODAY].dots ??= []).push({ key: "today", color: theme.accent });

    for (const [date, { upcoming, completed }] of Object.entries(
      tripDotsByDate,
    )) {
      ensure(date);
      const dots = (result[date].dots ??= []);
      if (upcoming) dots.push({ key: "trip", color: theme.warning });
      else if (completed) dots.push({ key: "trip", color: theme.success });
    }

    localUnavailable.forEach((date) => {
      ensure(date);
      const isSaved = dbSavedSet.has(date);
      result[date] = {
        ...result[date],
        selected: true,
        selectedColor: isSaved ? theme.danger : theme.warning,
        selectedTextColor: theme.onAccent,
      };
    });

    return result;
  }, [tripDotsByDate, localUnavailable, dbSavedSet, theme]);

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
            pushUndo(localUnavailable);
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
            pushUndo(localUnavailable);
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {hasPendingChanges && (
            <TouchableOpacity
              style={[
                styles.headerDiscardBtn,
                { backgroundColor: theme.surfaceElevated },
              ]}
              onPress={handleDiscard}
              activeOpacity={0.7}
            >
              <Ionicons
                name="close-circle-outline"
                size={18}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.headerSaveBtn,
              hasPendingChanges
                ? { backgroundColor: theme.warning }
                : { backgroundColor: theme.surfaceElevated },
            ]}
            onPress={handleSave}
            disabled={!hasPendingChanges || isSaving}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.headerSaveBtnText,
                !hasPendingChanges && { color: theme.textTertiary },
              ]}
            >
              {isSaving ? "Saving…" : hasPendingChanges ? "Save" : "Saved ✓"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openDrawer} activeOpacity={0.7}>
            <Menu size={24} color={theme.textPrimary} strokeWidth={1.75} />
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
    theme,
    styles,
  ]);

  const monthLabel = formatMonthName(currentMonth);
  const isUnavailable = futureCountThisMonth > 0;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ProfileCompletionBanner />
      <DocExpiryWarningBanner />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AvailabilityIntroStrip />

        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: isUnavailable
                ? theme.danger + "18"
                : theme.success + "18",
              borderColor: isUnavailable
                ? theme.danger + "30"
                : theme.success + "30",
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isUnavailable ? theme.danger : theme.success,
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: isUnavailable ? theme.danger : theme.success,
              },
            ]}
          >
            {futureCountThisMonth === 0
              ? `Available all of ${monthLabel}`
              : `${futureCountThisMonth} day${futureCountThisMonth > 1 ? "s" : ""} unavailable in ${monthLabel}`}
            {pendingAddThisMonth > 0 ? ` · ${pendingAddThisMonth} unsaved` : ""}
          </Text>
          {isUnavailable && (
            <TouchableOpacity
              onPress={handleClearMonth}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.clearText, { color: theme.danger }]}>
                Clear month
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.calendarCard, { borderColor: theme.border }]}>
          <Calendar
            key={scheme}
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
              backgroundColor: theme.surface,
              calendarBackground: theme.surface,
              monthTextColor: theme.textPrimary,
              textMonthFontSize: 16,
              textMonthFontWeight: "700",
              arrowColor: theme.accent,
              textSectionTitleColor: theme.textSecondary,
              textDayHeaderFontSize: 12,
              textDayHeaderFontWeight: "600",
              dayTextColor: theme.textPrimary,
              textDayFontSize: 14,
              textDayFontWeight: "500",
              todayTextColor: theme.accent,
              todayBackgroundColor: theme.accent + "25",
              selectedDayBackgroundColor: theme.danger,
              selectedDayTextColor: theme.onAccent,
              textDisabledColor: theme.textTertiary,
            }}
          />
        </View>

        <View style={styles.legend}>
          <LegendItem
            color={theme.danger}
            label="Unavailable (saved)"
            shape="square"
            textColor={theme.textSecondary}
          />
          <LegendItem
            color={theme.warning}
            label="Unsaved"
            shape="square"
            textColor={theme.textSecondary}
          />
          <LegendItem
            color={theme.warning}
            label="Upcoming trip"
            shape="dot"
            textColor={theme.textSecondary}
          />
          <LegendItem
            color={theme.success}
            label="Completed"
            shape="dot"
            textColor={theme.textSecondary}
          />
        </View>

        {upcomingTrips.length > 0 && (
          <View style={styles.listSection}>
            <View style={styles.listSectionHeader}>
              <Badge
                label="Upcoming Trips"
                color={theme.warning}
                dot
                uppercase
              />
              <Text
                style={[styles.sectionCount, { color: theme.textTertiary }]}
              >
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

      {undoToast !== null && (
        <View
          style={[
            styles.undoToast,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
            },
          ]}
          pointerEvents="box-none"
        >
          <Text
            style={[styles.undoToastText, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {undoToast}
          </Text>
          <TouchableOpacity
            onPress={handleUndo}
            style={[
              styles.undoToastBtn,
              { backgroundColor: theme.warning },
            ]}
            activeOpacity={0.8}
            disabled={undoStack.length === 0}
          >
            <Text style={[styles.undoToastBtnText, { color: theme.onAccent }]}>
              Undo
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

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
    <View style={legendStyles.legendItem}>
      {shape === "dot" ? (
        <View style={[legendStyles.legendDot, { backgroundColor: color }]} />
      ) : (
        <View style={[legendStyles.legendSwatch, { backgroundColor: color }]} />
      )}
      <Text style={[legendStyles.legendLabel, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { ...typeScale.caption, fontWeight: "400" },
});

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1 },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginRight: 16,
    },
    headerSaveBtn: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      minWidth: 50,
      alignItems: "center",
    },
    headerSaveBtnText: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.onAccent,
    },
    headerDiscardBtn: {
      padding: 6,
      borderRadius: 8,
    },
    scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
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
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { ...typeScale.footnote, fontWeight: "600", flex: 1 },
    clearText: {
      ...typeScale.caption,
      fontWeight: "600",
      textDecorationLine: "underline",
    },
    calendarCard: {
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      marginBottom: 12,
      ...elevation(theme, "raised"),
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 12,
      marginBottom: 20,
    },
    listSection: { marginBottom: 16 },
    listSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    sectionCount: { ...typeScale.footnote, fontWeight: "600" },
    undoToast: {
      position: "absolute",
      bottom: 24,
      left: 16,
      right: 16,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      ...elevation(theme, "floating"),
      borderWidth: 1,
    },
    undoToastText: {
      flex: 1,
      ...typeScale.footnote,
      fontWeight: "400",
    },
    undoToastBtn: {
      borderRadius: 7,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    undoToastBtnText: {
      ...typeScale.footnote,
      fontWeight: "700",
    },
  });
}
