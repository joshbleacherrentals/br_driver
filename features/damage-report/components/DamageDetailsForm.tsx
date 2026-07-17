import { DANGER_RED } from "@/constants/Colors";
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

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#000" },
  requiredBadge: {
    backgroundColor: DANGER_RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
});
