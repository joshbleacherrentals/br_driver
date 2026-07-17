import { DamageReportData } from "@/hooks/db/useDamageReport";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, StyleSheet, TouchableOpacity } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BleacherDamageBadgeProps {
  damageReport: DamageReportData;
  bleacherNumber?: number | string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityLabel(value: string | number | null): string {
  if (value === "major" || value === 1) return "Major";
  if (value === "minor" || value === 0) return "Minor";
  return "None";
}

function worstSeverity(
  seat: string | number | null,
  haul: string | number | null,
): "major" | "minor" | "none" {
  const seatLabel = severityLabel(seat);
  const haulLabel = severityLabel(haul);
  if (seatLabel === "Major" || haulLabel === "Major") return "major";
  if (seatLabel === "Minor" || haulLabel === "Minor") return "minor";
  return "none";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BleacherDamageBadge({
  damageReport,
  bleacherNumber,
}: BleacherDamageBadgeProps) {
  const severity = worstSeverity(
    damageReport.seat_damage ?? damageReport.is_safe_to_sit,
    damageReport.haul_damage ?? damageReport.is_safe_to_haul,
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
      `• Seating Configuration: ${severityLabel(damageReport.seat_damage ?? damageReport.is_safe_to_sit)}`,
      `• Hauling Configuration: ${severityLabel(damageReport.haul_damage ?? damageReport.is_safe_to_haul)}`,
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
    backgroundColor: "transparent",
    borderColor: "#FF3B30",
  },
  pillMinor: {
    backgroundColor: "transparent",
    borderColor: "#FF9500",
  },
  pillNone: {
    backgroundColor: "transparent",
    borderColor: "#34C759",
  },
});
