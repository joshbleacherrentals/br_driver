/**
 * The bleacher filter on each tab.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * With `All` covering every open report in the company, finding one bleacher
 * by scrolling stopped being possible. Only bleachers that actually have
 * something open are offered: the rest lead to an empty list.
 */

import type { BleacherOption } from "@/features/damage-report-list/hooks/useBleachersWithOpenReports";
import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function BleacherFilterSelect({
  options,
  value,
  onChange,
}: {
  options: BleacherOption[];
  value: string | null;
  onChange: (bleacherUuid: string | null) => void;
}) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <>
      <TouchableOpacity
        testID="bleacher-filter"
        style={styles.trigger}
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="funnel-outline" size={16} color={theme.textSecondary} />
        <Text style={styles.triggerText}>
          {selected
            ? `Bleacher #${selected.bleacherNumber ?? "?"}`
            : "All bleachers"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Filter by bleacher</Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>All bleachers</Text>
              </TouchableOpacity>

              {options.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.option}
                  onPress={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>
                    Bleacher #{option.bleacherNumber ?? "?"}
                  </Text>
                  <Text style={styles.optionMeta}>
                    {option.openReports} open
                  </Text>
                </TouchableOpacity>
              ))}

              {options.length === 0 && (
                <Text style={styles.optionMeta}>
                  Nothing is reported open right now.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      alignSelf: "flex-start",
    },
    triggerText: { ...typeScale.footnote, fontWeight: "600", color: theme.header },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      padding: 16,
      maxHeight: "70%",
      gap: 4,
    },
    sheetTitle: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.header,
      marginBottom: 8,
    },
    option: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    optionText: { ...typeScale.callout, color: theme.textPrimary },
    optionMeta: { ...typeScale.caption, color: theme.textSecondary },
  });
}
