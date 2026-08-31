import { useThemedStyles } from "@/hooks/useThemedStyles";
import { type ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export interface BleacherOption {
  uuid: string;
  bleacher_number: number | string;
  label?: string;
  /**
   * Heading this option sits under ("Same storage location"). Rows are already
   * ordered by the caller; the header is drawn wherever the label changes, and
   * suppressed while searching, where a flat list of hits is what you want.
   */
  groupLabel?: string;
  bleacher_rows?: number | null;
  resolved_address?: string | null;
}

interface BleacherDropdownProps {
  options: BleacherOption[];
  selectedUuid?: string | null;
  onChange: (uuid: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

type DropdownStyles = ReturnType<typeof makeStyles>;

const BleacherRow = React.memo(function BleacherRow({
  item,
  selected,
  header,
  onSelect,
  styles,
  accentColor,
}: {
  item: BleacherOption;
  selected: boolean;
  header: string | null;
  onSelect: (uuid: string) => void;
  styles: DropdownStyles;
  accentColor: string;
}) {
  const handlePress = useCallback(() => onSelect(item.uuid), [item.uuid, onSelect]);

  return (
    <>
      {header ? <Text style={styles.groupHeader}>{header}</Text> : null}
      <TouchableOpacity
        style={[styles.listItem, selected && styles.listItemSelected]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.listItemLeft}>
          <Text
            style={[
              styles.listItemNumber,
              selected && styles.listItemNumberSelected,
            ]}
          >
            #{item.bleacher_number}
          </Text>
          {!!item.label && (
            <Text style={styles.listItemLabel}>{item.label}</Text>
          )}
        </View>
        {selected && (
          <Ionicons name="checkmark-circle" size={20} color={accentColor} />
        )}
      </TouchableOpacity>
    </>
  );
});

export default function BleacherDropdown({
  options,
  selectedUuid,
  onChange,
  placeholder = "Select bleacher…",
  disabled = false,
}: BleacherDropdownProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.uuid === selectedUuid);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          String(o.bleacher_number).includes(query.trim()) ||
          o.label?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  const handleSelect = useCallback(
    (uuid: string) => {
      onChange(uuid);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const searching = query.trim().length > 0;

  const keyExtractor = useCallback((item: BleacherOption) => item.uuid, []);

  const renderItem = useCallback(
    ({ item, index }: { item: BleacherOption; index: number }) => (
      <BleacherRow
        item={item}
        selected={item.uuid === selectedUuid}
        // Headers mark where a group starts; while searching there are no groups.
        header={
          searching || item.groupLabel === filtered[index - 1]?.groupLabel
            ? null
            : (item.groupLabel ?? null)
        }
        onSelect={handleSelect}
        styles={styles}
        accentColor={theme.accent}
      />
    ),
    [filtered, handleSelect, searching, selectedUuid, styles, theme.accent],
  );

  const iconColor = disabled ? theme.textTertiary : theme.textPrimary;
  const chevronColor = disabled ? theme.textTertiary : theme.textSecondary;

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="albums-outline" size={16} color={iconColor} />
        <Text
          style={[
            styles.triggerText,
            !selected && styles.triggerPlaceholder,
            disabled && styles.triggerTextDisabled,
          ]}
        >
          {selected ? `Bleacher #${selected.bleacher_number}` : placeholder}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={chevronColor}
        />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => {
            setOpen(false);
            setQuery("");
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
        >
          <View style={styles.handle} />

          <Text style={styles.sheetTitle}>Select Bleacher</Text>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by number…"
              placeholderTextColor={theme.textTertiary}
              value={query}
              onChangeText={setQuery}
              keyboardType="numeric"
              autoFocus={false}
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              filtered.length === 0 ? styles.emptyContainer : undefined
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No bleachers found</Text>
            }
            renderItem={renderItem}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.surfaceElevated,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    triggerDisabled: { opacity: 0.5 },
    triggerText: {
      flex: 1,
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    triggerPlaceholder: { color: theme.textSecondary, fontWeight: "400" },
    triggerTextDisabled: { color: theme.textTertiary },
    overlay: { flex: 1, backgroundColor: theme.overlay },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingBottom: 32,
      maxHeight: "65%",
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: theme.textTertiary,
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 12,
    },
    sheetTitle: {
      ...typeScale.body,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 12,
      textAlign: "center",
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.surfaceElevated,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: { flex: 1, ...typeScale.subhead, color: theme.textPrimary },
    emptyContainer: { flex: 1, alignItems: "center", paddingTop: 32 },
    groupHeader: {
      ...typeScale.caption,
      color: theme.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
    },
    emptyText: { ...typeScale.subhead, color: theme.textSecondary },
    listItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.separator,
    },
    listItemSelected: {
      backgroundColor: theme.accentSoft,
      borderRadius: 8,
      paddingHorizontal: 8,
    },
    listItemLeft: { gap: 2 },
    listItemNumber: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    listItemNumberSelected: { color: theme.accent },
    listItemLabel: { ...typeScale.caption, color: theme.textSecondary },
  });
}
