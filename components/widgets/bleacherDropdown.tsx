import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
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
} from 'react-native';

export interface BleacherOption {
  uuid: string;
  bleacher_number: number | string;
  label?: string;
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

export default function BleacherDropdown({
  options,
  selectedUuid,
  onChange,
  placeholder = 'Select bleacher…',
  disabled = false,
}: BleacherDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.uuid === selectedUuid);

  const filtered = query.trim()
    ? options.filter((o) =>
        String(o.bleacher_number).includes(query.trim()) ||
        o.label?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const handleSelect = useCallback(
    (uuid: string) => {
      onChange(uuid);
      setOpen(false);
      setQuery('');
    },
    [onChange]
  );

  return (
    <>
      {/* Trigger */}
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="albums-outline" size={16} color={disabled ? '#C7C7CC' : '#1C1C1E'} />
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
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={disabled ? '#C7C7CC' : '#8E8E93'}
        />
      </TouchableOpacity>

      {/* Modal sheet */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => { setOpen(false); setQuery(''); }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.sheetTitle}>Select Bleacher</Text>

          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#8E8E93" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by number…"
              placeholderTextColor="#C7C7CC"
              value={query}
              onChangeText={setQuery}
              keyboardType="numeric"
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>

          {/* List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.uuid}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={filtered.length === 0 && styles.emptyContainer}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No bleachers found</Text>
            }
            renderItem={({ item }) => {
              const isSelected = item.uuid === selectedUuid;
              return (
                <TouchableOpacity
                  style={[styles.listItem, isSelected && styles.listItemSelected]}
                  onPress={() => handleSelect(item.uuid)}
                  activeOpacity={0.7}
                >
                  <View style={styles.listItemLeft}>
                    <Text style={[styles.listItemNumber, isSelected && styles.listItemNumberSelected]}>
                      #{item.bleacher_number}
                    </Text>
                    {!!item.label && (
                      <Text style={styles.listItemLabel}>{item.label}</Text>
                    )}
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color="#0A84FF" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  triggerDisabled: { opacity: 0.5 },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  triggerPlaceholder: { color: '#8E8E93', fontWeight: '400' },
  triggerTextDisabled: { color: '#C7C7CC' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '65%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D1D6',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 32 },
  emptyText: { fontSize: 14, color: '#8E8E93' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  listItemSelected: { backgroundColor: '#F0F6FF', borderRadius: 8, paddingHorizontal: 8 },
  listItemLeft: { gap: 2 },
  listItemNumber: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  listItemNumberSelected: { color: '#0A84FF' },
  listItemLabel: { fontSize: 12, color: '#8E8E93' },
});