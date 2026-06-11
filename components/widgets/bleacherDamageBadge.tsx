import { DamageReportData } from "@/hooks/db/useDamageReport";
import { Ionicons } from "@expo/vector-icons";
import { usePowerSyncQuery } from "@powersync/react-native";
import React from "react";
import { Alert, StyleSheet, TouchableOpacity } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BleacherDamageBadgeProps {
  damageReport: DamageReportData;
  bleacherNumber?: number | string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Severity mapping:
 *  null  → None   (no damage)
 *  0     → Minor
 *  1     → Major
 */
function severityLabel(value: number | null): string {
  if (value === 1) return "Major";
  if (value === 0) return "Minor";
  return "None";
}

/**
 * Returns the worst severity across both fields so the badge colour
 * reflects the most serious issue at a glance.
 *  1 (major) > 0 (minor) > null (none)
 */
function worstSeverity(
  sit: number | null,
  haul: number | null,
): "major" | "minor" | "none" {
  if (sit === 1 || haul === 1) return "major";
  if (sit === 0 || haul === 0) return "minor";
  return "none";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BleacherDamageBadge({
  damageReport,
  bleacherNumber,
}: BleacherDamageBadgeProps) {
  const severity = worstSeverity(
    damageReport.is_safe_to_sit,
    damageReport.is_safe_to_haul,
  );

  // Fetch the count of damage photos so we can mention it in the alert
  const photoRows = usePowerSyncQuery<{ photo_path: string }>(
    `SELECT photo_path 
    FROM "DamageReportPhotos" 
    WHERE damage_report_uuid = ? 
    AND photo_path IS NOT NULL`,
    [damageReport.id],
  );

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso ?? "—";
    }
  };

  const handlePress = () => {
    const title = bleacherNumber
      ? `Bleacher #${bleacherNumber}: Damage Report`
      : "Damage Report";

    const lines = [
      `Reported: ${formatDateTime(damageReport.created_at)}`,
      "",
      "Damage Severity:",
      `• Seating Configuration: ${severityLabel(damageReport.is_safe_to_sit)}`,
      `• Hauling Configuration: ${severityLabel(damageReport.is_safe_to_haul)}`,
    ];

    if (damageReport.note) {
      lines.push("", `Notes:\n${damageReport.note}`);
    }

    lines.push(
      "",
      "[WARNING] This damage report is unresolved. Exercise caution when setting up or hauling this bleacher.",
    );

    Alert.alert(title, lines.join("\n"), [{ text: "Close", style: "cancel" }]);
  };

  return (
    <TouchableOpacity
      style={[
        styles.pill,
        severity === "major"
          ? styles.pillMajor
          : severity === "minor"
            ? styles.pillMinor
            : styles.pillNone,
      ]}
      onPress={handlePress}
      activeOpacity={0.75}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Ionicons
        name="warning"
        size={13}
        color={
          severity === "major"
            ? "#FF3B30"
            : severity === "minor"
              ? "#FF9500"
              : "#34C759"
        }
      />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillMajor: {
    backgroundColor: "#FFF1F0",
    borderColor: "#FF3B30",
  },
  pillMinor: {
    backgroundColor: "#FFF8EC",
    borderColor: "#FF9500",
  },
  pillNone: {
    backgroundColor: "#E8F9ED",
    borderColor: "#34C759",
  },
});
