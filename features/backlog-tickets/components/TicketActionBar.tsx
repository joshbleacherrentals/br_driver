/**
 * The pair of buttons at the bottom of a ticket, floating over the content.
 *
 * Floating rather than a docked footer for the same reason the header is: the
 * damage report established that language, and a driver moving between the two
 * screens should not have to re-read the chrome. It also means the actions
 * never scroll away — a description can run to a screenful, and the thing the
 * driver came to do must stay under their thumb.
 *
 * The bar renders whatever pair it is given — Close/Edit, Cancel/Save, or a
 * lone Send. Which pair that is belongs to the screen, not here.
 */

import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** What the screen has to keep clear at the bottom of its scroll content. */
export const ACTION_BAR_CLEARANCE = 96;

export type TicketAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
};

export default function TicketActionBar({
  secondary,
  primary,
}: {
  /** The way out — Close or Cancel. */
  secondary?: TicketAction;
  /** The way forward — Send, Edit or Save. Absent once the window closes. */
  primary?: TicketAction;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, 16) }]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        {secondary ? (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={secondary.onPress}
            disabled={secondary.disabled || secondary.busy}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, { color: theme.textPrimary }]}>
              {secondary.label}
            </Text>
          </TouchableOpacity>
        ) : null}

        {primary ? (
          <TouchableOpacity
            style={[
              styles.button,
              styles.primaryButton,
              // Two-to-one when it shares the row, so the action the driver
              // came for is visibly the main one.
              secondary ? styles.primaryBeside : null,
              (primary.disabled || primary.busy) && styles.disabled,
            ]}
            onPress={primary.onPress}
            disabled={primary.disabled || primary.busy}
            activeOpacity={0.8}
          >
            {primary.busy ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={[styles.label, { color: theme.onAccent }]}>
                {primary.label}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      backgroundColor: "transparent",
      zIndex: 10,
    },
    row: { flexDirection: "row", gap: 12 },
    button: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: radius.card,
      alignItems: "center",
      justifyContent: "center",
      ...elevation(theme, "floating"),
    },
    secondaryButton: {
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    primaryButton: { backgroundColor: theme.accent },
    primaryBeside: { flex: 2 },
    disabled: { opacity: 0.5 },
    label: { ...typeScale.callout, fontWeight: "600" },
  });
