import { powerSyncDb } from "@/components/providers/SystemProvider";
import { useTheme } from "@/hooks/useTheme";
import { DatabaseZap } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  DevSettings,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { type ThemeColors, typeScale } from "@/constants/theme";

import { useThemedStyles } from "@/hooks/useThemedStyles";
/**
 * DEV-only helper: wipes the local PowerSync database and reloads the app, so
 * the next launch runs a fresh first-sync against an empty SQLite (the exact
 * path DriverGate handles). Clerk session is untouched, so no re-login needed.
 *
 * Never rendered in production — guarded by __DEV__ both here and at the call
 * site. Do not ship references to this in a PR beyond local testing.
 */
export default function DevResetDbButton() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);

  if (!__DEV__) return null;

  const onReset = () => {
    Alert.alert(
      "Reset local DB?",
      "Wipes the local PowerSync database and reloads. A full re-sync runs on restart.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await powerSyncDb.disconnectAndClear();
            } finally {
              DevSettings.reload();
            }
          },
        },
      ],
    );
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onReset}
      disabled={busy}
      activeOpacity={0.7}
    >
      <DatabaseZap size={16} color={theme.warning} strokeWidth={2} />
      <Text style={styles.text}>
        {busy ? "Resetting…" : "DEV: Reset local DB"}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
    },
    text: {
      color: theme.warning,
      fontWeight: "600",
      ...typeScale.subhead,
    },
  });
}
