import { BRAND_BLUE, DARK_BLUE } from "@/constants/Colors";
import { useBatchBleachers } from "@/hooks/db/useBleacher";
import {
  DamageReportData,
  useMyDamageReports,
} from "@/hooks/db/useDamageReport";
import { useDriver } from "@/hooks/db/useDriver";
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
import { SafeAreaView } from "react-native-safe-area-context";

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

const SEVERITY_COLORS = {
  major: { bg: "#FFF1F0", border: "#FF3B30", text: "#FF3B30" },
  minor: { bg: "#FFF8EC", border: "#FF9500", text: "#FF9500" },
  none: { bg: "#E8F9ED", border: "#34C759", text: "#34C759" },
};

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
}: {
  report: DamageReportData;
  bleacherNumber: string | number | null;
  photoCount: number;
  onPress: () => void;
}) {
  const isResolved = !!report.resolved_at;
  const severity = worstSeverity(report.seat_damage, report.haul_damage);
  const colors = SEVERITY_COLORS[severity];

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
        <View
          style={[
            styles.statusBadge,
            isResolved ? styles.statusResolved : styles.statusOpen,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: isResolved ? "#34C759" : "#FF3B30" },
            ]}
          >
            {isResolved ? "Resolved" : "Open"}
          </Text>
        </View>
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
          <Ionicons name="fitness-outline" size={14} color="#8E8E93" />
          <Text style={styles.footerText}>
            Seat: {severityLabel(report.seat_damage)}
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="car-outline" size={14} color="#8E8E93" />
          <Text style={styles.footerText}>
            Haul: {severityLabel(report.haul_damage)}
          </Text>
        </View>
        {photoCount > 0 && (
          <View style={styles.footerItem}>
            <Ionicons name="camera-outline" size={14} color="#8E8E93" />
            <Text style={styles.footerText}>{photoCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function DamageReportHistoryScreen() {
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
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : damageReports.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyText}>No damage reports yet.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
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
              />
            );
          }}
        />
      )}

      {/* FAB — new damage report */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push("/damage-report")}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: { fontSize: 15, color: "#8E8E93" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  bleacherNumber: { fontSize: 15, fontWeight: "700", color: DARK_BLUE },
  severityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  severityText: { fontSize: 11, fontWeight: "600" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusOpen: { backgroundColor: "#FFF1F0" },
  statusResolved: { backgroundColor: "#E8F9ED" },
  statusText: { fontSize: 11, fontWeight: "700" },
  cardBody: { marginBottom: 8 },
  dateText: { fontSize: 12, color: "#8E8E93", marginBottom: 4 },
  noteText: { fontSize: 13, color: "#3C3C43", lineHeight: 18 },
  cardFooter: {
    flexDirection: "row",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: "#F2F2F7",
    paddingTop: 8,
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: 12, color: "#8E8E93" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND_BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
