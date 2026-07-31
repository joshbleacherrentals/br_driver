import { useThemedStyles } from "@/hooks/useThemedStyles";
import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  visible: boolean;
  current: number;
  total: number;
  onAbort: () => void;
}

export function SubmitProgressModal({
  visible,
  current,
  total,
  onAbort,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const progress = total > 0 ? current / total : 0;

  const handleAbort = () => {
    Alert.alert(
      "Cancel Damage Report?",
      "Are you sure you want to cancel this damage report? All progress will be lost.",
      [
        { text: "Keep Going", style: "cancel" },
        { text: "Cancel Report", style: "destructive", onPress: onAbort },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View style={styles.card}>
          <ActivityIndicator
            size="large"
            color={theme.accent}
            style={{ marginBottom: 16 }}
          />

          <Text style={styles.title}>Preparing Photos</Text>
          <Text style={styles.counter}>
            {current} of {total}
          </Text>

          <View style={styles.trackOuter}>
            <View
              style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>

          <TouchableOpacity
            style={styles.abortBtn}
            onPress={handleAbort}
            activeOpacity={0.7}
          >
            <Text style={styles.abortText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 28,
      width: "80%",
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    title: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 4,
    },
    counter: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      marginBottom: 16,
    },
    trackOuter: {
      width: "100%",
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.separator,
      overflow: "hidden",
      marginBottom: 24,
    },
    trackFill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
    abortBtn: {
      paddingVertical: 10,
      paddingHorizontal: 32,
    },
    abortText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.danger,
    },
  });
}
