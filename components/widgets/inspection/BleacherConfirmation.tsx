import BleacherDropdown, {
  type BleacherOption,
} from "@/components/widgets/bleacherDropdown";
import {
  BLEACHER_CHANGE_REASONS,
  bleacherChangeReasonLabel,
} from "@/constants/bleacherChangeReasons";
import { type ThemeColors, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import type {
  BleacherGroup,
  OrderableBleacher,
  OrderedBleacher,
} from "@/utils/orderBleacherOptions";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Which bleacher is really on the hitch.
 *
 * Managers assign a specific unit, but the assigned one is often buried at the
 * back of the yard and the driver takes an equivalent from the front. Until the
 * driver could say so, the inspection and any damage report were filed against
 * a trailer nobody had looked at.
 *
 * It sits at the very top of the inspection, above the questions, because
 * everything below it is about the bleacher this answers.
 */

const GROUP_LABELS: Record<BleacherGroup, string | undefined> = {
  assigned: "Assigned to this trip",
  same_location: "Same storage location",
  same_zone: "Same zone",
  other: "All bleachers",
};

export interface BleacherConfirmationProps<T extends OrderableBleacher> {
  /** Fleet, already ranked by `orderBleacherOptions`. */
  options: OrderedBleacher<T>[];
  assignedBleacherUuid: string | null;
  selectedUuid: string | null;
  /** `WorkTrackers.actual_bleacher_uuid` — non-null locks the picker. */
  confirmedBleacherUuid: string | null;
  reason: string | null;
  onSelect: (uuid: string) => void;
  onReasonChange: (reason: string | null) => void;
}

export default function BleacherConfirmation<T extends OrderableBleacher>({
  options,
  assignedBleacherUuid,
  selectedUuid,
  confirmedBleacherUuid,
  reason,
  onSelect,
  onReasonChange,
}: BleacherConfirmationProps<T>) {
  const styles = useThemedStyles(makeStyles);

  // Confirmation happens once, at the first inspection. A later inspection
  // reports the bleacher but cannot re-answer it — only a manager can correct
  // that, from the web.
  const locked = confirmedBleacherUuid !== null;
  const swapped = !locked && selectedUuid !== assignedBleacherUuid;

  const assigned = options.find((o) => o.id === assignedBleacherUuid);

  const dropdownOptions = useMemo<BleacherOption[]>(
    () =>
      options.map((o) => ({
        uuid: o.id,
        bleacher_number: o.bleacher_number ?? "—",
        groupLabel: GROUP_LABELS[o.group],
      })),
    [options],
  );

  const handleChange = useCallback(
    (uuid: string) => {
      onSelect(uuid);
      // Going back to the assigned bleacher un-asks the question, so the reason
      // picked a moment ago must not linger and be submitted with it.
      if (uuid === assignedBleacherUuid && reason !== null) onReasonChange(null);
    },
    [assignedBleacherUuid, onReasonChange, onSelect, reason],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Which bleacher did you take?</Text>

      {assigned ? (
        <Text style={styles.assignedNote}>
          {`Assigned to this trip: Bleacher #${assigned.bleacher_number ?? "—"}`}
        </Text>
      ) : null}

      <BleacherDropdown
        options={dropdownOptions}
        selectedUuid={selectedUuid}
        onChange={handleChange}
        disabled={locked}
        placeholder="Select bleacher…"
      />

      {locked ? (
        <Text style={styles.lockedNote}>
          {reason
            ? `Already confirmed — ${bleacherChangeReasonLabel(reason)}`
            : "Already confirmed for this trip."}
        </Text>
      ) : null}

      {swapped ? (
        <View style={styles.reasonBlock}>
          <Text style={styles.reasonPrompt}>Why not the assigned one?</Text>
          <View style={styles.reasonRow}>
            {BLEACHER_CHANGE_REASONS.map((option) => (
              <ReasonChip
                key={option.code}
                code={option.code}
                label={option.label}
                selected={reason === option.code}
                onPress={onReasonChange}
                styles={styles}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

type ConfirmationStyles = ReturnType<typeof makeStyles>;

const ReasonChip = React.memo(function ReasonChip({
  code,
  label,
  selected,
  onPress,
  styles,
}: {
  code: string;
  label: string;
  selected: boolean;
  onPress: (code: string) => void;
  styles: ConfirmationStyles;
}) {
  const handlePress = useCallback(() => onPress(code), [code, onPress]);

  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    section: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 16,
      gap: 8,
    },
    sectionTitle: {
      ...typeScale.headline,
      color: theme.textPrimary,
    },
    assignedNote: {
      ...typeScale.footnote,
      color: theme.textSecondary,
    },
    lockedNote: {
      ...typeScale.footnote,
      color: theme.textTertiary,
    },
    reasonBlock: { gap: 8, marginTop: 4 },
    reasonPrompt: {
      ...typeScale.subhead,
      color: theme.textPrimary,
    },
    reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    chipSelected: {
      borderColor: theme.accent,
      backgroundColor: theme.accentSoft,
    },
    chipText: {
      ...typeScale.footnote,
      color: theme.textSecondary,
    },
    chipTextSelected: { color: theme.accent },
  });
