import { useThemedStyles } from "@/hooks/useThemedStyles";
import { type ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React, { useMemo } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ForceUpdateModalProps = {
  visible: boolean;
  message: string | null;
  onUpdate: () => void;
  onExit: () => void;
};

export default function ForceUpdateModal({
  visible,
  message,
  onUpdate,
  onExit,
}: ForceUpdateModalProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const body =
    message ??
    "This version of the app is no longer supported. Please update to continue.";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={Platform.OS === "android" ? onExit : undefined}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.badge, { color: theme.danger }]}>
            Update required
          </Text>
          <Text style={styles.title}>Please update the app</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            {Platform.OS === "android" && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={onExit}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, { color: theme.accent }]}>
                  Exit App
                </Text>
              </TouchableOpacity>
            )}
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
      gap: 10,
    },
    badge: {
      ...typeScale.footnote,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
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
      marginTop: 10,
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
