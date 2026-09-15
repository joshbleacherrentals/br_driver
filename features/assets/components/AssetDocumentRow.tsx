/**
 * A PDF that lives in Supabase Storage, offered honestly.
 *
 * This is the one thing on the Assets page that a phone in a field cannot do.
 * Rather than a tappable row that fails, the row states which of the three
 * situations it is in — no document on file, a document but no connection, or
 * a document you can open — and only the third is pressable. A driver who
 * knows the certificate exists but is out of signal can come back to it; one
 * who taps a dead control just learns the app is broken.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useInitialSyncStatus } from "@/hooks/db/useInitialSyncStatus";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface AssetDocumentRowProps {
  label: string;
  /** A fully-qualified URL, or null when nothing was ever filed. */
  url: string | null;
}

export default function AssetDocumentRow({
  label,
  url,
}: AssetDocumentRowProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { connected } = useInitialSyncStatus();
  const [opening, setOpening] = useState(false);

  const openable = !!url && connected;

  const handlePress = useCallback(async () => {
    if (!url || opening) return;
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      // The browser refusing to open is the same outcome as being offline,
      // and the row already says what to do about it: try again with signal.
    } finally {
      setOpening(false);
    }
  }, [url, opening]);

  const status = !url
    ? "Not on file"
    : !connected
      ? "Needs a connection"
      : "Open PDF";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !openable && styles.rowInert,
        pressed && openable && styles.rowPressed,
      ]}
      onPress={handlePress}
      disabled={!openable || opening}
      accessibilityRole="button"
      accessibilityState={{ disabled: !openable }}
      accessibilityLabel={`${label}: ${status}`}
    >
      <Ionicons
        name="document-text-outline"
        size={20}
        color={openable ? theme.accent : theme.textTertiary}
      />
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      {opening ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : openable ? (
        <Ionicons name="open-outline" size={18} color={theme.accent} />
      ) : (
        <Ionicons
          name={url ? "cloud-offline-outline" : "remove-outline"}
          size={18}
          color={theme.textTertiary}
        />
      )}
    </Pressable>
  );
}

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
    rowInert: { opacity: 0.6 },
    rowPressed: { opacity: 0.7 },
    body: { flex: 1, gap: 2 },
    label: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    status: { ...typeScale.footnote, color: theme.textSecondary },
  });
