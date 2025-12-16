import { PRIMARY } from "@/constants/AuthStyles";
import { currentDriver$ } from "@/state/stores/drivers.store";
import { workTrackerInspections$ } from "@/state/stores/workTrackerInspections.store";
import { workTrackers$ } from "@/state/stores/workTrackers.store";
import { generateId } from "@/utils/supabase/supaLegend/util";
import { useObservable, useValue } from "@legendapp/state/react";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import InspectionPhotoUploader from "./InspectionPhotoUploader";

interface InspectionFormProps {
  workTrackerKey: string; // legend_state_uuid
  type: "pre-trip" | "post-trip";
  onComplete: () => void;
  onCancel: () => void;
}

export default function InspectionForm({
  workTrackerKey,
  type,
  onComplete,
  onCancel,
}: InspectionFormProps) {
  const wt = useValue(workTrackers$[workTrackerKey]);
  const driverId = useValue(currentDriver$.driver_id);

  const inspectionUuid = useMemo(() => {
    const existingUuid = type === "pre-trip" ? wt?.pre_inspection_uuid : wt?.post_inspection_uuid;
    return existingUuid || generateId();
  }, [wt, type]);

  // Get existing inspection data if it exists
  const existingInspection = useValue(workTrackerInspections$[inspectionUuid]);
  const formData$ = useObservable(() => {
    if (existingInspection) {
      // If inspection exists, use its data
      return { ...existingInspection };
    } else {
      // New inspection with default values
      return {
        inspection_uuid: inspectionUuid,
        walk_around_complete: false,
        has_issues: false,
        notes: "",
      };
    }
  });

  const formData = useValue(formData$);
  const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);

  const handleSubmitConfirmed = () => {
    // Get the current form data
    const data = formData$.get();

    // Now write to the synced observable - this will trigger sync to Supabase
    workTrackerInspections$[inspectionUuid].assign({
      ...data,
      inspection_uuid: inspectionUuid,
      has_issues: data.has_issues || false,
      notes: data.notes || "",
    });

    workTrackers$[workTrackerKey].assign({
      ...(type === "pre-trip"
        ? { pre_inspection_uuid: inspectionUuid }
        : { post_inspection_uuid: inspectionUuid }),
    });

    onComplete();
  };

  const handleSubmit = () => {
    // Validation
    if (!formData.walk_around_complete) {
      Alert.alert(
        "Walk Around Incomplete",
        "Please take a walk around the bleacher before submitting."
      );
      return;
    }

    Alert.alert(
      "Confirm Submission",
      `Submit ${type === "pre-trip" ? "pre-trip" : "post-trip"} inspection?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: handleSubmitConfirmed,
        },
      ]
    );
  };

  const title = type === "pre-trip" ? "Pre-Trip Inspection" : "Post-Trip Inspection";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Complete all checklist items</Text>
        {/* Visual Inspection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Visual Inspection of Vehicle</Text>
          <Text style={styles.sectionSubtitle}>(clean & stickered)</Text>

          <CheckboxRow
            label="Walk Around Complete?"
            value={formData.walk_around_complete || false}
            onToggle={() =>
              formData$.assign({
                walk_around_complete: !(formData.walk_around_complete || false),
              })
            }
          />
          <CheckboxRow
            label="Are there issues with the bleacher?"
            value={formData.has_issues || false}
            onToggle={() =>
              formData$.assign({
                has_issues: !(formData.has_issues || false),
              })
            }
          />
        </View>
        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issues or Details of Damages *</Text>
          <Text style={styles.sectionNote}>
            Please record any issues or details of damages below.
          </Text>
          <Text style={styles.sectionNote}>
            You can add photos in the next section. If you have any issues attaching photos, please
            send in Slack or text to 226-931-6016
          </Text>
          <TextInput
            style={styles.textInput}
            placeholder="Record any issues or details of damages..."
            multiline
            numberOfLines={4}
            value={formData.notes || ""}
            onChangeText={(text) => formData$.assign({ notes: text })}
          />
        </View>
        {/* Photo Upload */}
        <View style={styles.section}>
          <InspectionPhotoUploader inspectionUuid={inspectionUuid} />
        </View>
        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            // disabled={mutation.isPending}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton]}
            onPress={handleSubmit}
            // disabled={mutation.isPending}
          >
            <Text style={styles.submitButtonText}>Submit Inspection</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CheckboxRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.checkboxRow}>
      <Text style={styles.checkboxLabel}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ true: PRIMARY }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    marginBottom: 24,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: PRIMARY,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 12,
    fontStyle: "italic",
  },
  sectionNote: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 8,
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  checkboxLabel: {
    fontSize: 15,
    color: "#1E293B",
    flex: 1,
  },
  ratingContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  ratingButtonActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748B",
  },
  ratingTextActive: {
    color: "#fff",
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#1E293B",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 100,
    textAlignVertical: "top",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748B",
  },
  submitButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
