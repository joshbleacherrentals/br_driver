import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import type { DocumentPhoto } from "../types";
import {
  pickDamagePhotosFromCamera,
  pickDamagePhotosFromLibrary,
  type PhotoImportOptions,
  type PhotoImportProgress,
} from "../utils/pickDamagePhotos";
import {
  DAMAGE_REPORT_PHOTO_SUBJECT,
  MAX_PHOTOS,
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

  // A large selection takes tens of seconds to copy off the picker, so photos
  // are appended one at a time as they land and the count is shown in the grid.
  // See `pickDamagePhotos.ts`.
  const [importing, setImporting] = useState<PhotoImportProgress | null>(null);

  // The append target, read at emission time rather than from the closure: a
  // batch emits many photos before React has re-rendered with the first one, so
  // `values.photos` would be stale from the second photo onwards and every
  // append but the last would be lost.
  const photosRef = useRef(values.photos);
  photosRef.current = importing ? photosRef.current : values.photos;

  const runImport = useCallback(
    async (pick: (options: PhotoImportOptions) => Promise<DocumentPhoto[]>) => {
      // On before the picker even opens: exporting 25 assets happens inside the
      // picker, before it resolves, so an indicator turned on afterwards is
      // seconds late — which is the whole complaint.
      setImporting({ done: 0, total: null });
      try {
        await pick({
          onProgress: setImporting,
          onPhoto: (photo) => {
            const next = [...photosRef.current, photo];
            photosRef.current = next;
            onChange({ photos: next });
          },
        });
      } finally {
        setImporting(null);
      }
    },
    [onChange],
  );

  const addFromCamera = useCallback(async () => {
    if (limit.remaining <= 0) {
      const { title, message } = photoLimitReachedAlert(limit);
      Alert.alert(title, message);
      return;
    }
    await runImport((options) => pickDamagePhotosFromCamera(options));
  }, [limit, runImport]);

  const addFromLibrary = useCallback(async () => {
    if (limit.remaining <= 0) {
      const { title, message } = photoLimitReachedAlert(limit);
      Alert.alert(title, message);
      return;
    }

    // The picker is capped at the headroom and the result is trimmed against it
    // as well, inside `pickDamagePhotosFromLibrary` — before the first tile
    // appears, so nothing is ever shown and then taken away again.
    await runImport((options) =>
      pickDamagePhotosFromLibrary({ ...options, limit }),
    );
  }, [limit, runImport]);

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
          importing={importing}
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
