import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React, { useCallback, useMemo } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import type { DocumentPhoto } from "../types";
import {
  pickDamagePhotosFromCamera,
  pickDamagePhotosFromLibrary,
} from "../utils/pickDamagePhotos";
import {
  DAMAGE_REPORT_PHOTO_SUBJECT,
  MAX_PHOTOS,
  admitPickedPhotos,
  describePhotoLimit,
  photoLimitReachedAlert,
} from "@/utils/photoLimit";
import DamageSeveritySelector, {
  DamageSeverityValue,
} from "./DamageSeveritySelector";
import { EditablePhotoGrid } from "./EditablePhotoGrid";

import { useThemedStyles } from "@/hooks/useThemedStyles";
export type DamageDetailsFormValues = {
  seatDamage: DamageSeverityValue;
  haulDamage: DamageSeverityValue;
  note: string;
  photos: DocumentPhoto[];
};

type Props = {
  values: DamageDetailsFormValues;
  onChange: (patch: Partial<DamageDetailsFormValues>) => void;
};

export function DamageDetailsForm({ values, onChange }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // §Cap — the grid already disables both add controls at the limit; these
  // guards are what makes the cap real rather than cosmetic, since a queued tap
  // or a stale render could still reach a handler.
  // Memoized on the count alone: the add callbacks below take the whole state
  // as a dependency, and a fresh object every render would make their identity
  // churn for no reason.
  const limit = useMemo(
    () =>
      describePhotoLimit(
        values.photos.length,
        MAX_PHOTOS,
        DAMAGE_REPORT_PHOTO_SUBJECT,
      ),
    [values.photos.length],
  );

  const addFromCamera = useCallback(async () => {
    if (limit.remaining <= 0) {
      const { title, message } = photoLimitReachedAlert(limit);
      Alert.alert(title, message);
      return;
    }
    const picked = await pickDamagePhotosFromCamera();
    if (picked.length === 0) return;
    onChange({ photos: [...values.photos, ...picked] });
  }, [limit, onChange, values.photos]);

  const addFromLibrary = useCallback(async () => {
    if (limit.remaining <= 0) {
      const { title, message } = photoLimitReachedAlert(limit);
      Alert.alert(title, message);
      return;
    }

    // The picker is capped at the headroom, so on iOS the driver simply cannot
    // over-select. `selectionLimit` is not honoured everywhere though (some
    // Android pickers ignore it), so the result is trimmed as well — and never
    // silently: dropping picks without saying so would leave the driver
    // believing photos were attached that were not.
    const picked = await pickDamagePhotosFromLibrary({
      selectionLimit: limit.remaining,
    });
    if (picked.length === 0) return;

    const { kept, alert } = admitPickedPhotos(picked, limit);
    if (alert) Alert.alert(alert.title, alert.message);

    onChange({ photos: [...values.photos, ...kept] });
  }, [limit, onChange, values.photos]);

  const removePhoto = useCallback(
    (index: number) => {
      onChange({
        photos: values.photos.filter((_, i) => i !== index),
      });
    },
    [onChange, values.photos],
  );

  return (
    <>
      <View style={styles.section}>
        <DamageSeveritySelector
          label="Seating Configuration Damage"
          value={values.seatDamage}
          onChange={(seatDamage) => onChange({ seatDamage })}
        />
      </View>

      <View style={styles.section}>
        <DamageSeveritySelector
          label="Hauling Configuration Damage"
          value={values.haulDamage}
          onChange={(haulDamage) => onChange({ haulDamage })}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Damage Notes</Text>
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
        </View>
        <TextInput
          style={styles.textInput}
          value={values.note}
          onChangeText={(note) => onChange({ note })}
          placeholder="Describe the damage..."
          placeholderTextColor={theme.textTertiary}
          multiline
        />
      </View>

      <View style={styles.section}>
        <EditablePhotoGrid
          photos={values.photos}
          title="Damage Photos"
          required
          maxPhotos={MAX_PHOTOS}
          limitSubject={DAMAGE_REPORT_PHOTO_SUBJECT}
          onAddFromCamera={addFromCamera}
          onAddFromLibrary={addFromLibrary}
          onRemove={removePhoto}
        />
      </View>
    </>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    section: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      padding: 16,
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 8,
    },
    sectionTitle: {
      flex: 1,
      flexShrink: 1,
      ...typeScale.title3,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    requiredBadge: {
      flexShrink: 0,
      backgroundColor: theme.danger,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    requiredText: {
      ...typeScale.caption2,
      fontWeight: "700",
      color: theme.onAccent,
      letterSpacing: 0.5,
    },
    textInput: {
      backgroundColor: theme.surfaceElevated,
      borderRadius: radius.control,
      padding: 12,
      ...typeScale.callout,
      minHeight: 100,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
    },
  });
}
