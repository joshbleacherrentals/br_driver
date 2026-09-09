/**
 * "Select all that apply" — the open damage reports on a bleacher, for a driver
 * to tick before filing a new one.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * The intervention this component IS: managers were receiving three to five
 * reports about one piece of damage, because every driver who saw it was
 * required to report it. Showing what is already known — with the photos and
 * the note, not just a severity — is what turns the fourth report into a tick.
 *
 * Three screens mount it: the inspection's yes-branch, the `+` on the damage
 * reports screen, and (read-only) the trips screen. Ticking and opening are
 * deliberately separate gestures: a driver has to be able to look at a report
 * before agreeing that it describes what they see.
 */

import DamageReportCard from "@/components/widgets/DamageReportCard";
import { typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { useUserDisplayNames } from "@/hooks/db/useCurrentUser";
import {
  useDamageReports,
  useDamageReportThumbnails,
} from "@/hooks/db/useDamageReport";
import { useAckCounts } from "@/hooks/db/useDamageReportAcknowledgements";
import { useTheme } from "@/hooks/useTheme";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

export type ExistingDamageChecklistProps = {
  bleacherUuid: string | null | undefined;
  /** Ids the driver has ticked so far. Ignored in `view` mode. */
  selectedIds: string[];
  onToggle?: (damageReportId: string) => void;
  onOpenReport?: (damageReportId: string) => void;
  /** `select` collects a selection; `view` is a read-only look at a bleacher. */
  mode?: "select" | "view";
  bleacherNumber?: number | null;
};

export default function ExistingDamageChecklist({
  bleacherUuid,
  selectedIds,
  onToggle,
  onOpenReport,
  mode = "select",
  bleacherNumber,
}: ExistingDamageChecklistProps) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  // Cross-driver by design (§15): the damage belongs to the bleacher, and the
  // reports worth ticking are precisely the ones other drivers filed.
  const { damageReports, isLoading } = useDamageReports(bleacherUuid);

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

  const { counts } = useAckCounts(reportIds);
  const { thumbnails } = useDamageReportThumbnails(reportIds);
  const names = useUserDisplayNames(authorIds);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleToggle = useCallback(
    (id: string) => onToggle?.(id),
    [onToggle],
  );
  const handleOpen = useCallback(
    (id: string) => onOpenReport?.(id),
    [onOpenReport],
  );

  if (isLoading) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Loading damage reports…</Text>
      </View>
    );
  }

  if (damageReports.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No open damage reports on this bleacher.
        </Text>
      </View>
    );
  }

  // A plain mapped list rather than a FlatList: this renders inside the
  // inspection's own ScrollView, where a nested virtualised list both warns and
  // scrolls badly — and a bleacher realistically carries a handful of open
  // reports, not hundreds.
  return (
    <View style={styles.list}>
      {damageReports.map((report) => (
        <DamageReportCard
          key={report.id}
          report={report}
          bleacherNumber={bleacherNumber}
          authorLabel={
            report.created_by_user_uuid
              ? (names[report.created_by_user_uuid] ?? null)
              : null
          }
          thumbnails={thumbnails[report.id] ?? []}
          ackCount={counts[report.id] ?? 0}
          selectable={mode === "select"}
          selected={selected.has(report.id)}
          onToggleSelected={() => handleToggle(report.id)}
          onPress={() => handleOpen(report.id)}
        />
      ))}
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    list: { gap: 10 },
    empty: { paddingVertical: 16, alignItems: "center" },
    emptyText: { ...typeScale.footnote, color: theme.textSecondary },
  });
}
