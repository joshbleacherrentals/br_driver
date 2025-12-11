import { PRIMARY } from "@/constants/AuthStyles";
import {
  createAndLinkPostTripInspection,
  createAndLinkPreTripInspection,
} from "@/db/online/inspections";
import { InspectionData } from "@/types/inspection";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { completeTrip } from "@/utils/tripActions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
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
  workTrackerId: number;
  type: "pre-trip" | "post-trip";
  onComplete: () => void;
  onCancel: () => void;
}

export default function InspectionForm({
  workTrackerId,
  type,
  onComplete,
  onCancel,
}: InspectionFormProps) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<InspectionData>({
    is_bleacher_clean: false,
    is_sticker_condition_good: false,
    is_spare_tire_present: false,
    is_tire_condition_good: false,
    is_safety_chain_condition_good: false,
    are_safety_chains_attached: false,
    are_safety_pins_attached: false,
    are_lights_in_place: false,
    are_lights_functioning: false,
    is_cylinder_sleeve_in_place: false,
    opens_closes_smoothly: false,
    e_brake_pin_works: false,
    electric_trailer_brake_works: false,
    all_spindles_present: false,
    locking_tabs_present: false,
    handrails_present: false,
    any_broken_parts: false,
    overall_rating: 3,
    notes: "",
  });

  // Track the created inspection ID for photo uploads
  const [inspectionId, setInspectionId] = useState<number | null>(null);
  const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);

  // Log inspectionId changes
  React.useEffect(() => {
    console.log(`[InspectionForm] ${type} inspectionId changed:`, inspectionId);
  }, [inspectionId, type]);

  const mutation = useMutation({
    mutationFn: async () => {
      console.log(`[InspectionForm] Starting ${type} inspection mutation`);
      if (type === "pre-trip") {
        const result = await createAndLinkPreTripInspection(supabase, workTrackerId, formData);
        console.log(`[InspectionForm] Pre-trip inspection result:`, result);
        return result;
      } else {
        const inspection = await createAndLinkPostTripInspection(supabase, workTrackerId, formData);
        console.log(`[InspectionForm] Post-trip inspection result:`, inspection);
        // After post-trip inspection, mark trip as complete
        await completeTrip(supabase, workTrackerId);
        return inspection;
      }
    },
    onSuccess: (data) => {
      console.log(`[InspectionForm] ${type} inspection success:`, data);
      console.log(`[InspectionForm] inspection_id:`, data?.inspection_id);
      // Store inspection ID for photo uploads
      if (data?.inspection_id) {
        setInspectionId(data.inspection_id);
        console.log(`[InspectionForm] setInspectionId called with:`, data.inspection_id);

        // If there are pending photos, wait a bit for them to start uploading
        if (pendingPhotoUris.length > 0) {
          console.log(
            `[InspectionForm] Waiting for ${pendingPhotoUris.length} pending photos to start uploading...`
          );
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["workTrackers"] });
            onComplete();
          }, 1000); // Give the photo uploader time to react to inspectionId change
        } else {
          queryClient.invalidateQueries({ queryKey: ["workTrackers"] });
          onComplete();
        }
      } else {
        console.warn(`[InspectionForm] No inspection_id in response!`, data);
        queryClient.invalidateQueries({ queryKey: ["workTrackers"] });
        onComplete();
      }
    },
    onError: (error) => {
      console.error(`${type} inspection error:`, error);
      Alert.alert("Error", "Failed to submit inspection. Please try again.");
    },
  });

  const toggleField = (field: keyof InspectionData) => {
    if (typeof formData[field] === "boolean") {
      setFormData({ ...formData, [field]: !formData[field] });
    }
  };

  const setRating = (rating: number) => {
    setFormData({ ...formData, overall_rating: rating });
  };

  const handleSubmit = () => {
    // Validation
    if (!formData.notes.trim()) {
      Alert.alert("Missing Information", "Please add inspection notes before submitting.");
      return;
    }

    Alert.alert(
      "Confirm Submission",
      `Submit ${type === "pre-trip" ? "pre-trip" : "post-trip"} inspection?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: () => mutation.mutate(),
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
            label="Is the bleacher clean?"
            value={formData.is_bleacher_clean}
            onToggle={() => toggleField("is_bleacher_clean")}
          />
          <CheckboxRow
            label="Are the stickers on the bleacher?"
            value={formData.is_sticker_condition_good}
            onToggle={() => toggleField("is_sticker_condition_good")}
          />
        </View>
        {/* Tires Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tires</Text>

          <CheckboxRow
            label="Is the spare present?"
            value={formData.is_spare_tire_present}
            onToggle={() => toggleField("is_spare_tire_present")}
          />
          <CheckboxRow
            label="Are the tires in good/safe condition?"
            value={formData.is_tire_condition_good}
            onToggle={() => toggleField("is_tire_condition_good")}
          />
        </View>
        {/* Safety Chains Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Chains</Text>

          <CheckboxRow
            label="Are they all in place with working safety hooks?"
            value={formData.is_safety_chain_condition_good}
            onToggle={() => toggleField("is_safety_chain_condition_good")}
          />
          <CheckboxRow
            label="Are the safety hooks attached to the tow vehicle?"
            value={formData.are_safety_chains_attached}
            onToggle={() => toggleField("are_safety_chains_attached")}
          />
        </View>
        {/* Gooseneck/Bumper Hitch Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gooseneck / Bumper Hitch</Text>

          <CheckboxRow
            label="Are the safety pins in place?"
            value={formData.are_safety_pins_attached}
            onToggle={() => toggleField("are_safety_pins_attached")}
          />
        </View>
        {/* Lights Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lights</Text>

          <CheckboxRow
            label="Are all lights in place?"
            value={formData.are_lights_in_place}
            onToggle={() => toggleField("are_lights_in_place")}
          />
          <CheckboxRow
            label="Are all lights in working order?"
            value={formData.are_lights_functioning}
            onToggle={() => toggleField("are_lights_functioning")}
          />
        </View>
        {/* Hydraulics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hydraulics</Text>

          <CheckboxRow
            label="Cylinder sleeve lock in place?"
            value={formData.is_cylinder_sleeve_in_place}
            onToggle={() => toggleField("is_cylinder_sleeve_in_place")}
          />
          <CheckboxRow
            label="Opens and closes smooth, and level"
            value={formData.opens_closes_smoothly}
            onToggle={() => toggleField("opens_closes_smoothly")}
          />
        </View>
        {/* Brakes Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brakes</Text>

          <CheckboxRow
            label="Pull E-Brake pin to test"
            value={formData.e_brake_pin_works}
            onToggle={() => toggleField("e_brake_pin_works")}
          />
          <CheckboxRow
            label="Electric trailer brakes working?"
            value={formData.electric_trailer_brake_works}
            onToggle={() => toggleField("electric_trailer_brake_works")}
          />
        </View>
        {/* Spindles & Safety Rails Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spindles & Safety Rails</Text>

          <CheckboxRow
            label="All spindles present (NO wire spindles)"
            value={formData.all_spindles_present}
            onToggle={() => toggleField("all_spindles_present")}
          />
          <CheckboxRow
            label="All locking tabs on side rails present and working"
            value={formData.locking_tabs_present}
            onToggle={() => toggleField("locking_tabs_present")}
          />
          <CheckboxRow
            label="All handrails are present"
            value={formData.handrails_present}
            onToggle={() => toggleField("handrails_present")}
          />
        </View>
        {/* Damage Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Damage Report</Text>

          <CheckboxRow
            label="Are there any broken parts?"
            value={formData.any_broken_parts}
            onToggle={() => toggleField("any_broken_parts")}
          />
        </View>
        {/* Overall Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Rating of Bleacher (1-5)</Text>
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <TouchableOpacity
                key={rating}
                style={[
                  styles.ratingButton,
                  formData.overall_rating === rating && styles.ratingButtonActive,
                ]}
                onPress={() => setRating(rating)}
              >
                <Text
                  style={[
                    styles.ratingText,
                    formData.overall_rating === rating && styles.ratingTextActive,
                  ]}
                >
                  {rating}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
          />
        </View>
        {/* Photo Upload */}
        <View style={styles.section}>
          <InspectionPhotoUploader
            inspectionId={inspectionId}
            onPendingPhotosChange={setPendingPhotoUris}
          />
        </View>
        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={mutation.isPending}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, mutation.isPending && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={mutation.isPending}
          >
            <Text style={styles.submitButtonText}>
              {mutation.isPending ? "Submitting..." : "Submit Inspection"}
            </Text>
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
