import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type DamageSeverityValue = null | 0 | 1;

export type DamageSeverityEnum = 'none' | 'minor' | 'major';

const SEVERITY_OPTIONS: {
  value: DamageSeverityValue;
  enumValue: DamageSeverityEnum;
  label: string;
  color: string;
  bg: string;
  icon: string;
}[] = [
  { value: null, enumValue: 'none',  label: 'None',  color: '#34C759', bg: '#E8F9ED', icon: 'checkmark-circle' },
  { value: 0,    enumValue: 'minor', label: 'Minor', color: '#FF9500', bg: '#FFF3E0', icon: 'warning-outline' },
  { value: 1,    enumValue: 'major', label: 'Major', color: '#FF3B30', bg: '#FFEBEA', icon: 'warning' },
];

export function severityEnumToValue(e: DamageSeverityEnum): DamageSeverityValue {
  if (e === 'minor') return 0;
  if (e === 'major') return 1;
  return null;
}

export function severityValueToEnum(v: DamageSeverityValue): DamageSeverityEnum {
  if (v === 0) return 'minor';
  if (v === 1) return 'major';
  return 'none';
}

interface Props {
  label: string;
  value: DamageSeverityValue;
  onChange: (v: DamageSeverityValue) => void;
}

export default function DamageSeveritySelector({ label, value, onChange }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={styles.row}>
        {SEVERITY_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[
                styles.option,
                {
                  borderColor: active ? opt.color : '#E5E7EB',
                  backgroundColor: active ? opt.bg : '#F8F8F8',
                },
              ]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={opt.icon as any}
                size={20}
                color={active ? opt.color : '#8E8E93'}
              />
              <Text style={[styles.optionLabel, { color: active ? opt.color : '#8E8E93' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    gap: 4,
  },
  optionLabel: { fontSize: 13, fontWeight: '600' },
});
