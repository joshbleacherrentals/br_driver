/**
 * One bleacher in the fleet list.
 *
 * Memoized and given a stable `onPress` by the list, because this row is drawn
 * several hundred times: the Assets list is the whole fleet, and it is the
 * only screen in the app with a list that long.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AssetListRow } from "../utils/bleacherAssetView";

interface AssetListItemProps {
  row: AssetListRow;
  onOpen: (id: string) => void;
}

function AssetListItem({ row, onOpen }: AssetListItemProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const handlePress = useCallback(() => onOpen(row.id), [onOpen, row.id]);

  // Everything under the number, in the order a driver would ask for it.
  const subtitle = [row.typeName, row.storageLocationName, row.zoneName]
    .filter((part): part is string => !!part?.trim())
    .join(" · ");

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Bleacher ${row.bleacherNumber ?? "unnumbered"}`}
    >
      <View style={styles.numberChip}>
        <Text style={styles.numberText} numberOfLines={1}>
          {row.bleacherNumber ?? "?"}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          Bleacher {row.bleacherNumber ?? "—"}
        </Text>
        {subtitle.length > 0 ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </Pressable>
  );
}

export default React.memo(AssetListItem);

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    rowPressed: { opacity: 0.6 },
    numberChip: {
      minWidth: 52,
      paddingHorizontal: 8,
      height: 36,
      borderRadius: radius.control,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    numberText: {
      ...typeScale.headline,
      fontWeight: "700",
      color: theme.accent,
    },
    body: { flex: 1, gap: 2 },
    title: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    subtitle: { ...typeScale.footnote, color: theme.textSecondary },
  });
