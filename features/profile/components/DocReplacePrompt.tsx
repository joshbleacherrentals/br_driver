import { typeScale } from "@/constants/theme";
import type { DriverDocRow } from "@/features/profile/hooks/useDriverDocUploadStatuses";
import { useConfirmedMissingPhotoIds } from "@/hooks/useConfirmedMissingPhotoIds";
import { useFormTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  /** The `DriverDocuments` row behind this document, if it has one. */
  docRow: DriverDocRow | undefined;
  isBusy: boolean;
  onReplace: (rowId: string) => void;
};

/**
 * Shown for a single document once a direct bucket check confirmed its file
 * never arrived (§6.2). Until that confirmation exists the document is left
 * alone: a `failed` status by itself may just be a lost confirmation on an
 * upload that actually succeeded, and replacing on that guess would overwrite a
 * document the office already has.
 *
 * The gate lives here rather than in the caller so all three documents are
 * judged by the same rule, and by the same published signal as the app-wide
 * banner.
 *
 * There is exactly one row per (driver, document), so there is nothing to
 * reconcile here — one photo replaces one row in place.
 */
export function DocReplacePrompt({ docRow, isBusy, onReplace }: Props) {
  const { form: theme } = useFormTheme();
  const confirmedMissingPhotoIds = useConfirmedMissingPhotoIds();

  if (!docRow || !confirmedMissingPhotoIds.has(docRow.id)) return null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.danger + "18", borderColor: theme.danger },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline" size={16} color={theme.danger} />
        <Text style={[styles.text, { color: theme.danger }]}>
          This document was never stored on the server, and the original file is
          gone from this phone. Add it again to fix it.
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.accent }]}
        onPress={() => onReplace(docRow.id)}
        disabled={isBusy}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={theme.onAccent} />
        ) : (
          <Text style={[styles.buttonText, { color: theme.onAccent }]}>
            Replace Photo
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  text: {
    ...typeScale.footnote,
    fontWeight: "600",
    lineHeight: 18,
    flex: 1,
  },
  button: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    ...typeScale.subhead,
    fontWeight: "700",
  },
});
