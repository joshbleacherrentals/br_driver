import Badge from "@/components/ui/Badge";
import PhotoUploadStatusOverlay from "@/components/widgets/PhotoUploadStatusOverlay";
import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useBatchBleachers } from "@/hooks/db/useBleacher";
import {
  DamageReportData,
  useMyDamageReports,
} from "@/hooks/db/useDamageReport";
import { useDriver } from "@/hooks/db/useDriver";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { usePowerSyncQuery } from "@powersync/react-native";
import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useThemedStyles } from "@/hooks/useThemedStyles";

/** Shared by the FAB itself and by the overlay that has to clear it. */
const FAB_SIZE = 56;

function severityLabel(v: string | null): string {
  if (v === "major" || v === "1") return "Major";
  if (v === "minor" || v === "0") return "Minor";
  return "None";
}

function worstSeverity(
  seat: string | null,
  haul: string | null,
): "major" | "minor" | "none" {
  if (seat === "major" || haul === "major") return "major";
  if (seat === "minor" || haul === "minor") return "minor";
  return "none";
}

function severityColors(theme: ThemeColors, severity: "major" | "minor" | "none") {
  if (severity === "major") {
    return {
      bg: theme.danger + "18",
      border: theme.danger,
      text: theme.danger,
    };
  }
  if (severity === "minor") {
    return {
      bg: theme.warning + "18",
      border: theme.warning,
      text: theme.warning,
    };
  }
  return {
    bg: theme.secondaryAccentSoft,
    border: theme.success,
    text: theme.success,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function DamageReportCard({
  report,
  bleacherNumber,
  photoCount,
  onPress,
  styles,
  theme,
}: {
  report: DamageReportData;
  bleacherNumber: string | number | null;
  photoCount: number;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  theme: ThemeColors;
}) {
  const isResolved = !!report.resolved_at;
  const severity = worstSeverity(report.seat_damage, report.haul_damage);
  const colors = severityColors(theme, severity);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.bleacherNumber}>
            Bleacher #{bleacherNumber ?? "?"}
          </Text>
          <View
            style={[
              styles.severityPill,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <Ionicons name="warning" size={12} color={colors.text} />
            <Text style={[styles.severityText, { color: colors.text }]}>
              {severity.charAt(0).toUpperCase() + severity.slice(1)}
            </Text>
          </View>
        </View>
        <Badge
          label={isResolved ? "Resolved" : "Open"}
          color={isResolved ? theme.success : theme.danger}
        />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.dateText}>{formatDate(report.created_at)}</Text>
        {report.note ? (
          <Text style={styles.noteText} numberOfLines={2}>
            {report.note}
          </Text>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="fitness-outline" size={14} color={theme.textTertiary} />
          <Text style={styles.footerText}>
            Seat: {severityLabel(report.seat_damage)}
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="car-outline" size={14} color={theme.textTertiary} />
          <Text style={styles.footerText}>
            Haul: {severityLabel(report.haul_damage)}
          </Text>
        </View>
        {photoCount > 0 && (
          <View style={styles.footerItem}>
            <Ionicons name="camera-outline" size={14} color={theme.textTertiary} />
            <Text style={styles.footerText}>{photoCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function DamageReportHistoryScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { driver } = useDriver();
  const { damageReports, isLoading } = useMyDamageReports(driver?.user_uuid);

  const bleacherIds = damageReports.map((r) => r.bleacher_uuid);
  const bleachersMap = useBatchBleachers(bleacherIds);

  const photoCountRows = usePowerSyncQuery<{
    damage_report_uuid: string;
    cnt: number;
  }>(
    `SELECT damage_report_uuid, COUNT(*) as cnt
     FROM "DamageReportPhotos"
     GROUP BY damage_report_uuid`,
  );

  const photoCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of photoCountRows ?? []) {
      map[row.damage_report_uuid] = row.cnt;
    }
    return map;
  }, [photoCountRows]);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : damageReports.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="checkmark-circle-outline"
            size={48}
            color={theme.textTertiary}
          />
          <Text style={styles.emptyText}>No damage reports yet.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={damageReports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const bleacher = item.bleacher_uuid
              ? bleachersMap[item.bleacher_uuid]
              : null;
            return (
              <DamageReportCard
                report={item}
                bleacherNumber={bleacher?.bleacher_number ?? null}
                photoCount={photoCounts[item.id] ?? 0}
                onPress={() =>
                  router.push({
                    pathname: "/damage-report",
                    params: { damageReportId: item.id },
                  })
                }
                styles={styles}
                theme={theme}
              />
            );
          }}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push("/damage-report")}
      >
        <Ionicons name="add" size={28} color={theme.onAccent} />
      </TouchableOpacity>

      {/* Cleared over the FAB, which owns the same corner. */}
      <PhotoUploadStatusOverlay bottomInset={FAB_SIZE + 12} />
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    listContent: { padding: 16, paddingBottom: 100 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    emptyText: { ...typeScale.subhead, color: theme.textTertiary },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "card"),
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    bleacherNumber: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.header,
    },
    severityPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
    },
    severityText: { ...typeScale.caption2, fontWeight: "600" },
    cardBody: { marginBottom: 8 },
    dateText: { ...typeScale.caption, color: theme.textTertiary, marginBottom: 4 },
    noteText: {
      ...typeScale.footnote,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    cardFooter: {
      flexDirection: "row",
      gap: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.separator,
      paddingTop: 8,
    },
    footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    footerText: { ...typeScale.caption, color: theme.textTertiary },
    fab: {
      position: "absolute",
      bottom: 24,
      right: 20,
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      ...elevation(theme, "floating"),
    },
  });
}
