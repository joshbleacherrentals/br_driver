import { ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemedStyles } from "@/hooks/useThemedStyles";
export type DamageSeverityValue = null | 0 | 1;

export type DamageSeverityEnum = 'none' | 'minor' | 'major';

function severityOptions(theme: ThemeColors) {
  return [
    {
      value: null as DamageSeverityValue,
      enumValue: 'none' as const,
      label: 'None',
      color: theme.success,
      bg: theme.secondaryAccentSoft,
      icon: 'checkmark-circle',
    },
    {
      value: 0 as DamageSeverityValue,
      enumValue: 'minor' as const,
      label: 'Minor',
      color: theme.warning,
      bg: theme.warning + '18',
      icon: 'warning-outline',
    },
    {
      value: 1 as DamageSeverityValue,
      enumValue: 'major' as const,
      label: 'Major',
      color: theme.danger,
      bg: theme.danger + '18',
      icon: 'warning',
    },
  ];
}

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
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const options = severityOptions(theme);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[
                styles.option,
                {
                  borderColor: active ? opt.color : theme.border,
                  backgroundColor: active ? opt.bg : theme.surfaceElevated,
                },
              ]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={opt.icon as 'checkmark-circle' | 'warning-outline' | 'warning'}
                size={20}
                color={active ? opt.color : theme.textTertiary}
              />
              <Text
                style={[
                  styles.optionLabel,
                  { color: active ? opt.color : theme.textTertiary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    section: { marginBottom: 16 },
    sectionTitle: {
      ...typeScale.subhead,
      fontWeight: '700',
      color: theme.textPrimary,
      marginBottom: 8,
    },
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
    optionLabel: { ...typeScale.footnote, fontWeight: '600' },
  });
}
