import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React, { useCallback } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { DocumentPhoto } from "../types";
import {
  pickDamagePhotosFromCamera,
  pickDamagePhotosFromLibrary,
} from "../utils/pickDamagePhotos";
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

  const addFromCamera = useCallback(async () => {
    const picked = await pickDamagePhotosFromCamera();
    if (picked.length === 0) return;
    onChange({ photos: [...values.photos, ...picked] });
  }, [onChange, values.photos]);

  const addFromLibrary = useCallback(async () => {
    const picked = await pickDamagePhotosFromLibrary();
    if (picked.length === 0) return;
    onChange({ photos: [...values.photos, ...picked] });
  }, [onChange, values.photos]);

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
