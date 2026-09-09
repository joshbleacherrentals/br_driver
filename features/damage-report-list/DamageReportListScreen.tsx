/**
 * Damage Reports.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * This screen used to be "my damage reports" — a history. It is now the place
 * where a driver checks whether a bleacher's damage is already known, which is
 * the other half of the deduplication the inspection does: `All` covers every
 * open report in the company, `Created by me` keeps the old purpose.
 *
 * Both tabs show unresolved reports only, with one deliberate exception on
 * `Created by me` — see `useDamageReportLists`, where a report whose photos
 * never finished uploading stays visible because this screen is the only route
 * to Retry and Replace.
 *
 * And `+` no longer opens the form directly: on a bleacher with open reports it
 * shows them first. Filing something new is never blocked; it just stops being
 * the first thing that happens.
 */

import BottomSheetModal from "@/components/ui/BottomSheetModal";
import DamageReportCard from "@/components/widgets/DamageReportCard";
import ExistingDamageChecklist from "@/components/widgets/ExistingDamageChecklist";
import PhotoUploadStatusOverlay from "@/components/widgets/PhotoUploadStatusOverlay";
import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import BleacherFilterSelect from "@/features/damage-report-list/components/BleacherFilterSelect";
import DamageReportTabs, {
  type DamageReportTab,
} from "@/features/damage-report-list/components/DamageReportTabs";
import { resolvePlusAction } from "@/features/damage-report-list/hooks/resolvePlusAction";
import { useBleachersWithOpenReports } from "@/features/damage-report-list/hooks/useBleachersWithOpenReports";
import {
  useMyDamageReportsList,
  useOpenDamageReports,
} from "@/features/damage-report-list/hooks/useDamageReportLists";
import { acknowledgeDamageReports } from "@/features/damage-report/utils/acknowledgeDamageReports";
import { useBatchBleachers } from "@/hooks/db/useBleacher";
import { useUserDisplayNames } from "@/hooks/db/useCurrentUser";
import { useAckCounts } from "@/hooks/db/useDamageReportAcknowledgements";
import { useDamageReportThumbnails } from "@/hooks/db/useDamageReport";
import { useDriverScope } from "@/hooks/useDriverScope";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/** Shared by the FAB itself and by the overlay that has to clear it. */
const FAB_SIZE = 56;

export default function DamageReportListScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const scope = useDriverScope();

  const [tab, setTab] = useState<DamageReportTab>("all");
  const [bleacherUuid, setBleacherUuid] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const bleacherOptions = useBleachersWithOpenReports();
  const options = tab === "all" ? bleacherOptions.all : bleacherOptions.mine;

  const all = useOpenDamageReports(bleacherUuid);
  const mine = useMyDamageReportsList(bleacherUuid);
  const { damageReports, isLoading } = tab === "all" ? all : mine;

  const reportIds = useMemo(
    () => damageReports.map((report) => report.id),
    [damageReports],
  );
  const authorIds = useMemo(
    () =>
      damageReports.flatMap((report) =>
        report.created_by_user_uuid ? [report.created_by_user_uuid] : [],
      ),
    [damageReports],
  );
  const bleacherIds = useMemo(
    () => damageReports.map((report) => report.bleacher_uuid),
    [damageReports],
  );

  const { counts } = useAckCounts(reportIds);
  const { thumbnails } = useDamageReportThumbnails(reportIds);
  const names = useUserDisplayNames(authorIds);
  const bleachersById = useBatchBleachers(bleacherIds);

  const openReportsOnBleacher =
    options.find((option) => option.id === bleacherUuid)?.openReports ?? 0;

  const openReport = useCallback(
    (damageReportId: string, ownedByMe: boolean) => {
      // Own reports keep the full screen — it is where their photos are
      // repaired. Everything else is read-only.
      router.push({
        pathname: ownedByMe ? "/damage-report" : "/damage-report-view",
        params: { damageReportId },
      });
    },
    [router],
  );

  const toggleSelected = useCallback((damageReportId: string) => {
    setSelectedIds((prev) =>
      prev.includes(damageReportId)
        ? prev.filter((id) => id !== damageReportId)
        : [...prev, damageReportId],
    );
  }, []);

  const fileNewReport = useCallback(() => {
    setChecklistOpen(false);
    router.push({
      pathname: "/damage-report",
      params: bleacherUuid ? { bleacherUuid } : undefined,
    });
  }, [router, bleacherUuid]);

  const handlePlus = useCallback(() => {
    const action = resolvePlusAction({
      bleacherUuid,
      openReportCount: openReportsOnBleacher,
    });

    if (action === "pick-bleacher") {
      Alert.alert(
        "Pick a bleacher first",
        "Choose the bleacher with the damage, so we can show you what has already been reported on it.",
      );
      return;
    }

    if (action === "file-new") {
      fileNewReport();
      return;
    }

    setSelectedIds([]);
    setChecklistOpen(true);
  }, [bleacherUuid, openReportsOnBleacher, fileNewReport]);

  const confirmSelected = useCallback(async () => {
    if (!scope || selectedIds.length === 0) return;

    setIsConfirming(true);
    try {
      await acknowledgeDamageReports({
        reportIds: selectedIds,
        // Not part of an inspection: this is a driver looking at a bleacher and
        // recognising damage that is already on file.
        inspectionUuid: null,
        workTrackerUuid: null,
        scope,
      });
      setChecklistOpen(false);
      setSelectedIds([]);
      Alert.alert(
        "Confirmed",
        "Thanks — no new report was created. The existing reports now show that you saw this too.",
      );
    } catch (error) {
      console.error("[DamageReports] confirming existing reports failed:", error);
      Alert.alert("Error", "Could not record that. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  }, [scope, selectedIds]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <DamageReportTabs value={tab} onChange={setTab} />
        <BleacherFilterSelect
          options={options}
          value={bleacherUuid}
          onChange={setBleacherUuid}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Loading…</Text>
        </View>
      ) : damageReports.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="checkmark-circle-outline"
            size={48}
            color={theme.textTertiary}
          />
          <Text style={styles.emptyText}>
            {tab === "all"
              ? "No open damage reports."
              : "You have no open damage reports."}
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={damageReports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DamageReportCard
              report={item}
              bleacherNumber={
                item.bleacher_uuid
                  ? (bleachersById[item.bleacher_uuid]?.bleacher_number ?? null)
                  : null
              }
              authorLabel={
                item.created_by_user_uuid
                  ? (names[item.created_by_user_uuid] ?? null)
                  : null
              }
              thumbnails={thumbnails[item.id] ?? []}
              ackCount={counts[item.id] ?? 0}
              onPress={() =>
                openReport(
                  item.id,
                  !!scope && item.created_by_user_uuid === scope.userUuid,
                )
              }
            />
          )}
        />
      )}

      <TouchableOpacity
        testID="new-damage-report"
        style={styles.fab}
        activeOpacity={0.8}
        onPress={handlePlus}
      >
        <Ionicons name="add" size={28} color={theme.onAccent} />
      </TouchableOpacity>

      {/* Cleared over the FAB, which owns the same corner. */}
      <PhotoUploadStatusOverlay bottomInset={FAB_SIZE + 12} />

      <BottomSheetModal
        visible={checklistOpen}
        onClose={() => setChecklistOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Is it one of these?</Text>
          <Text style={styles.sheetHelp}>
            These are already open on this bleacher. Tick the ones that describe
            what you see — no new report is filed for those.
          </Text>

          <ExistingDamageChecklist
            bleacherUuid={bleacherUuid}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onOpenReport={(id) =>
              openReport(
                id,
                !!scope &&
                  damageReports.find((report) => report.id === id)
                    ?.created_by_user_uuid === scope.userUuid,
              )
            }
            mode="select"
          />

          <TouchableOpacity
            testID="confirm-selected"
            style={[
              styles.primaryButton,
              (selectedIds.length === 0 || isConfirming) &&
                styles.primaryButtonDisabled,
            ]}
            disabled={selectedIds.length === 0 || isConfirming}
            onPress={confirmSelected}
          >
            <Text style={styles.primaryButtonText}>
              {isConfirming
                ? "Saving…"
                : `Confirm selected (${selectedIds.length})`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="file-new-report"
            style={styles.secondaryButton}
            onPress={fileNewReport}
          >
            <Text style={styles.secondaryButtonText}>
              None of these — file a new report
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: { padding: 16, gap: 12 },
    listContent: { padding: 16, paddingTop: 0, gap: 12, paddingBottom: 96 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    emptyText: { ...typeScale.callout, color: theme.textSecondary },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 20,
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetContent: { padding: 16, gap: 12 },
    sheetTitle: { ...typeScale.title3, fontWeight: "700", color: theme.header },
    sheetHelp: { ...typeScale.footnote, color: theme.textSecondary },
    primaryButton: {
      marginTop: 8,
      padding: 16,
      borderRadius: radius.control,
      alignItems: "center",
      backgroundColor: theme.accent,
    },
    primaryButtonDisabled: { opacity: 0.5 },
    primaryButtonText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.onAccent,
    },
    secondaryButton: {
      padding: 16,
      borderRadius: radius.control,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryButtonText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.header,
    },
  });
}
