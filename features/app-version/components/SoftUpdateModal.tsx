import { useThemedStyles } from "@/hooks/useThemedStyles";
import { type ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React, { useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type SoftUpdateModalProps = {
  visible: boolean;
  daysLeft: number | null;
  message: string | null;
  onOk: () => void;
  onUpdate: () => void;
};

export default function SoftUpdateModal({
  visible,
  daysLeft,
  message,
  onOk,
  onUpdate,
}: SoftUpdateModalProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const title =
    daysLeft != null && daysLeft <= 3
      ? daysLeft === 1
        ? "Update required soon"
        : "Update available"
      : "New version available";

  const body =
    daysLeft != null && daysLeft <= 3
      ? daysLeft === 1
        ? "A new version of the app is available. You have 1 day to update."
        : `A new version of the app is available. You have ${daysLeft} days to update.`
      : (message ??
        "A new version of the app is available. Please update when you can.");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onOk}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={onOk}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, { color: theme.accent }]}>OK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={onUpdate}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, styles.btnPrimaryText]}>
                Update App
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 20,
      gap: 12,
    },
    title: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    body: {
      ...typeScale.subhead,
      lineHeight: 21,
      color: theme.textSecondary,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 8,
    },
    btn: {
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    btnSecondary: {
      backgroundColor: "transparent",
    },
    btnPrimary: {
      backgroundColor: theme.success,
    },
    btnText: {
      ...typeScale.subhead,
      fontWeight: "700",
    },
    btnPrimaryText: {
      color: theme.onSecondaryAccent,
    },
  });
}
