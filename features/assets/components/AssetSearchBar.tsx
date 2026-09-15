/**
 * Find a bleacher by the number painted on it.
 *
 * Numeric keypad by default, because that is what the driver is reading off
 * the trailer — but not `keyboardType="numeric"` alone: a few bleachers carry
 * a letter, and a keyboard that cannot type it would make them unfindable.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";

interface AssetSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function AssetSearchBar({ value, onChange }: AssetSearchBarProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrapper}>
      <Ionicons name="search" size={18} color={theme.textTertiary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Search by bleacher number"
        placeholderTextColor={theme.textTertiary}
        autoCorrect={false}
        autoCapitalize="characters"
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search bleachers by number"
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChange("")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default React.memo(AssetSearchBar);

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.surface,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 12,
      height: 44,
    },
    input: {
      flex: 1,
      ...typeScale.callout,
      color: theme.textPrimary,
      padding: 0,
    },
  });
