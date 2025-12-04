import { PostTripInspection } from "@/types/inspection";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { completeTrip } from "@/utils/tripActions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  workTrackerId: number;
  onComplete: () => void;
  onCancel: () => void;
}

export default function PostTripInspectionForm({ workTrackerId, onComplete, onCancel }: Props) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();

  // Form state
  const [bleacherDamage, setBleacherDamage] = useState(false);
  const [bleacherDamageNotes, setBleacherDamageNotes] = useState("");
  const [bleacherCleanliness, setBleacherCleanliness] = useState<"clean" | "dirty" | "damaged">(
    "clean"
  );
  const [bleacherCleanlinessNotes, setBleacherCleanlinessNotes] = useState("");
  const [deliveredSuccessfully, setDeliveredSuccessfully] = useState(false);
  const [deliveryIssues, setDeliveryIssues] = useState("");
  const [customerName, setCustomerName] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const inspection: PostTripInspection = {
        bleacherDamage,
        bleacherDamageNotes: bleacherDamageNotes || undefined,
        bleacherCleanliness,
        bleacherCleanlinessNotes: bleacherCleanlinessNotes || undefined,
        deliveredSuccessfully,
        deliveryIssues: deliveryIssues || undefined,
        customerName: customerName || undefined,
        timestamp: new Date().toISOString(),
      };

      // Save inspection data
      const { error: inspectionError } = await supabase
        .from("WorkTrackers")
        .update({ post_trip_inspection_data: inspection } as any)
        .eq("work_tracker_id", workTrackerId);

      if (inspectionError) throw inspectionError;

      // Mark trip as completed
      await completeTrip(supabase, workTrackerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workTrackers"] });
      onComplete();
    },
    onError: (error) => {
      console.error("Post-trip inspection error:", error);
      Alert.alert("Error", "Failed to submit inspection. Please try again.");
    },
  });

  const handleSubmit = () => {
    // Validation
    if (!deliveredSuccessfully) {
      Alert.alert(
        "Incomplete Inspection",
        "Please confirm successful delivery before submitting.",
        [{ text: "OK" }]
      );
      return;
    }

    submitMutation.mutate();
  };

  const handleCancel = () => {
    Alert.alert("Save Progress?", "Your answers will be cached locally.", [
      { text: "Nevermind", onPress: onCancel },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Post-Trip Inspection</Text>
        <TouchableOpacity onPress={handleCancel} disabled={submitMutation.isPending}>
          <Text style={styles.cancelButton}>Nevermind</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Delivery Confirmation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Confirmation *</Text>

          <View style={styles.checkboxRow}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setDeliveredSuccessfully(!deliveredSuccessfully)}
            >
              <View
                style={[styles.checkboxBox, deliveredSuccessfully && styles.checkboxBoxChecked]}
              >
                {deliveredSuccessfully && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Bleacher delivered successfully</Text>
            </TouchableOpacity>
          </View>

          {!deliveredSuccessfully && (
            <TextInput
              style={styles.textInput}
              placeholder="Describe any delivery issues..."
              value={deliveryIssues}
              onChangeText={setDeliveryIssues}
              multiline
            />
          )}
        </View>

        {/* Bleacher Condition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Final Bleacher Condition</Text>

          <View style={styles.checkboxRow}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setBleacherDamage(!bleacherDamage)}
            >
              <View style={[styles.checkboxBox, bleacherDamage && styles.checkboxBoxChecked]}>
                {bleacherDamage && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Damage Detected</Text>
            </TouchableOpacity>
          </View>

          {bleacherDamage && (
            <TextInput
              style={styles.textInput}
              placeholder="Describe damage..."
              value={bleacherDamageNotes}
              onChangeText={setBleacherDamageNotes}
              multiline
            />
          )}

          <Text style={styles.label}>Cleanliness</Text>
          <View style={styles.buttonGroup}>
            {(["clean", "dirty", "damaged"] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  bleacherCleanliness === option && styles.optionButtonSelected,
                ]}
                onPress={() => setBleacherCleanliness(option)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    bleacherCleanliness === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {bleacherCleanliness !== "clean" && (
            <TextInput
              style={styles.textInput}
              placeholder="Additional notes..."
              value={bleacherCleanlinessNotes}
              onChangeText={setBleacherCleanlinessNotes}
              multiline
            />
          )}
        </View>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Information</Text>

          <Text style={styles.label}>Contact Name (Optional)</Text>
          <TextInput
            style={[styles.textInput, { minHeight: 44 }]}
            placeholder="Customer name..."
            value={customerName}
            onChangeText={setCustomerName}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, submitMutation.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Complete Trip</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  cancelButton: {
    fontSize: 16,
    color: "#0A84FF",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
    marginTop: 12,
  },
  checkboxRow: {
    marginBottom: 12,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ccc",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: "#34C759",
    borderColor: "#34C759",
  },
  checkmark: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  checkboxLabel: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ddd",
    alignItems: "center",
  },
  optionButtonSelected: {
    borderColor: "#0A84FF",
    backgroundColor: "#E8F4FF",
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  optionButtonTextSelected: {
    color: "#0A84FF",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginTop: 8,
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#34C759",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: {
    backgroundColor: "#aaa",
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
});
