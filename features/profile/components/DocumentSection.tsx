import { typeScale } from "@/constants/theme";
import { DocReplacePrompt } from "@/features/profile/components/DocReplacePrompt";
import { ExpiryDateField } from "@/features/profile/components/ExpiryDateField";
import { useFormTheme } from "@/hooks/useTheme";
import { ExpiryTone, expiryBadge } from "@/utils/documentExpiry";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native";

type DocumentSectionProps = {
  title: string;
  iconName: string;
  photoUri: string | null;
  /** Upload-queue hint ("Uploading…" / "Upload failed"), when there is one. */
  uploadStatus: string | null;
  expiry: string | null;
  onChangeExpiry: (date: string | null) => void;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  onChooseFile: () => void;
  onRemovePhoto: () => void;
  /** Row for the bucket-confirmed-missing prompt; undefined when not applicable. */
  docRow?: Parameters<typeof DocReplacePrompt>[0]["docRow"];
  isReplacing: boolean;
  onReplace: (rowId: string) => void;
  /** Set after a failed save so the driver sees which field is holding it up. */
  showMissingExpiryError: boolean;
  /**
   * Why this document blocks the trip the driver came from, when it does.
   * Overrides the calendar-based tone: a date five weeks out is fine today
   * and still red for a trip six weeks out.
   */
  tripBlockNote?: string | null;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * One document card on the Edit Documents screen.
 *
 * The expiry status drives the card's border, icon and badge so a driver who
 * was sent here from a blocked trip can see at a glance which document is the
 * problem — never colour alone, always colour plus a sentence.
 */
export function DocumentSection({
  title,
  iconName,
  photoUri,
  uploadStatus,
  expiry,
  onChangeExpiry,
  onTakePhoto,
  onChoosePhoto,
  onChooseFile,
  onRemovePhoto,
  docRow,
  isReplacing,
  onReplace,
  showMissingExpiryError,
  tripBlockNote = null,
  onLayout,
}: DocumentSectionProps) {
  const { form: theme, theme: appTheme } = useFormTheme();

  const badge = expiryBadge(expiry);
  // A blank date only reads as an error once the driver has tried to save.
  const calendarTone: ExpiryTone =
    badge.status === "missing" && !showMissingExpiryError
      ? "neutral"
      : badge.tone;
  const tone: ExpiryTone = tripBlockNote ? "danger" : calendarTone;
  const badgeLabel = tripBlockNote ?? badge.label;

  const toneColor =
    tone === "danger"
      ? appTheme.danger
      : tone === "warning"
        ? appTheme.warning
        : null;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.documentSection,
        { backgroundColor: theme.card },
        toneColor
          ? { borderWidth: 2, borderColor: toneColor }
          : { borderWidth: 2, borderColor: "transparent" },
      ]}
    >
      <View style={styles.documentHeader}>
        <View style={styles.documentIconContainer}>
          <Ionicons
            name={iconName as any}
            size={24}
            color={toneColor ?? theme.accent}
          />
        </View>
        <Text style={[styles.documentTitle, { color: theme.text }]}>
          {title}
        </Text>
      </View>

      {tone !== "neutral" && (
        <View
          style={[styles.statusBadge, { backgroundColor: toneColor + "1F" }]}
        >
          <Ionicons
            name={
              !tripBlockNote && badge.status === "expiring_soon"
                ? "time"
                : "alert-circle"
            }
            size={16}
            color={toneColor ?? theme.accent}
          />
          <Text style={[styles.statusBadgeText, { color: toneColor ?? theme.text }]}>
            {badge.status === "expired" && !tripBlockNote
              ? `${badge.label} — you can't accept trips until this is updated`
              : badgeLabel}
          </Text>
        </View>
      )}

      {/* Renders only once a direct bucket check confirmed this document's file
          never arrived — see DocReplacePrompt for the gate. */}
      <DocReplacePrompt
        docRow={docRow}
        isBusy={isReplacing}
        onReplace={onReplace}
      />

      {photoUri ? (
        <View style={styles.photoContainer}>
          <Image source={{ uri: photoUri }} style={styles.photo} />
          {uploadStatus ? (
            <Text style={[styles.statusText, { color: theme.textTertiary }]}>
              {uploadStatus}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.removeButton, { backgroundColor: theme.danger }]}
            onPress={onRemovePhoto}
          >
            <Text style={[styles.removeButtonText, { color: theme.onAccent }]}>
              Remove
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[
            styles.emptyPhotoContainer,
            { backgroundColor: theme.inputBg, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.emptyPhotoText, { color: theme.textTertiary }]}>
            No photo uploaded
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.photoButton, { backgroundColor: theme.accent }]}
          onPress={onTakePhoto}
        >
          <Ionicons name="camera" size={16} color={theme.onAccent} />
          <Text style={[styles.photoButtonText, { color: theme.onAccent }]}>
            Take Photo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoButton, { backgroundColor: theme.accent }]}
          onPress={onChoosePhoto}
        >
          <Ionicons name="images" size={16} color={theme.onAccent} />
          <Text style={[styles.photoButtonText, { color: theme.onAccent }]}>
            Choose Photo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoButton, { backgroundColor: theme.accent }]}
          onPress={onChooseFile}
        >
          <Ionicons name="document-attach" size={16} color={theme.onAccent} />
          <Text style={[styles.photoButtonText, { color: theme.onAccent }]}>
            Choose File
          </Text>
        </TouchableOpacity>
      </View>

      <ExpiryDateField
        value={expiry}
        onChange={onChangeExpiry}
        tone={tone}
      />

      {showMissingExpiryError && !expiry && (
        <Text style={[styles.fieldError, { color: appTheme.danger }]}>
          Set an expiration date for this document.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  documentSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  documentIconContainer: {
    width: 32,
    height: 32,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  documentTitle: {
    ...typeScale.title3,
    fontWeight: "700",
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  statusBadgeText: {
    ...typeScale.footnote,
    fontWeight: "600",
    flex: 1,
  },
  photoContainer: {
    marginBottom: 12,
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusText: {
    ...typeScale.footnote,
    fontWeight: "600",
    marginBottom: 8,
  },
  removeButton: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  removeButtonText: {
    ...typeScale.subhead,
    fontWeight: "600",
  },
  emptyPhotoContainer: {
    height: 200,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyPhotoText: {
    ...typeScale.subhead,
    fontWeight: "400",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  photoButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
  },
  photoButtonText: {
    ...typeScale.caption2,
    fontWeight: "600",
  },
  fieldError: {
    ...typeScale.footnote,
    fontWeight: "600",
    marginTop: 6,
  },
});
