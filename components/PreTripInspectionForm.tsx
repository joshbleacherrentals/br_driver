import { PreTripInspection } from "@/types/inspection";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
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

export default function PreTripInspectionForm({ workTrackerId, onComplete, onCancel }: Props) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();

  // Form state
  const [bleacherDamage, setBleacherDamage] = useState(false);
  const [bleacherDamageNotes, setBleacherDamageNotes] = useState("");
  const [bleacherCleanliness, setBleacherCleanliness] = useState<"clean" | "dirty" | "damaged">(
    "clean"
  );
  const [bleacherCleanlinessNotes, setBleacherCleanlinessNotes] = useState("");
  const [vehicleCondition, setVehicleCondition] = useState<"good" | "issues" | "critical">("good");
  const [vehicleConditionNotes, setVehicleConditionNotes] = useState("");
  const [tiresChecked, setTiresChecked] = useState(false);
  const [tireIssues, setTireIssues] = useState("");
  const [lightsWorking, setLightsWorking] = useState(false);
  const [lightsIssues, setLightsIssues] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const inspection: PreTripInspection = {
        bleacherDamage,
        bleacherDamageNotes: bleacherDamageNotes || undefined,
        bleacherCleanliness,
        bleacherCleanlinessNotes: bleacherCleanlinessNotes || undefined,
        vehicleCondition,
        vehicleConditionNotes: vehicleConditionNotes || undefined,
        tiresChecked,
        tireIssues: tireIssues || undefined,
        lightsWorking,
        lightsIssues: lightsIssues || undefined,
        timestamp: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("WorkTrackers")
        .update({ pre_trip_inspection_data: inspection } as any)
        .eq("work_tracker_id", workTrackerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workTrackers"] });
      onComplete();
    },
    onError: (error) => {
      console.error("Pre-trip inspection error:", error);
      Alert.alert("Error", "Failed to submit inspection. Please try again.");
    },
  });

  const handleSubmit = () => {
    // Validation
    if (!tiresChecked || !lightsWorking) {
      Alert.alert(
        "Incomplete Inspection",
        "Please complete all required checks before submitting.",
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
        <Text style={styles.title}>Pre-Trip Inspection</Text>
        <TouchableOpacity onPress={handleCancel} disabled={submitMutation.isPending}>
          <Text style={styles.cancelButton}>Nevermind</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Bleacher Condition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bleacher Condition</Text>

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

        {/* Vehicle Condition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Condition</Text>

          <View style={styles.buttonGroup}>
            {(["good", "issues", "critical"] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  vehicleCondition === option && styles.optionButtonSelected,
                ]}
                onPress={() => setVehicleCondition(option)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    vehicleCondition === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {vehicleCondition !== "good" && (
            <TextInput
              style={styles.textInput}
              placeholder="Describe issues..."
              value={vehicleConditionNotes}
              onChangeText={setVehicleConditionNotes}
              multiline
            />
          )}
        </View>

        {/* Tires */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tire Check *</Text>

          <View style={styles.checkboxRow}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setTiresChecked(!tiresChecked)}
            >
              <View style={[styles.checkboxBox, tiresChecked && styles.checkboxBoxChecked]}>
                {tiresChecked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>All tires checked and in good condition</Text>
            </TouchableOpacity>
          </View>

          {tiresChecked && (
            <TextInput
              style={styles.textInput}
              placeholder="Any concerns? (optional)"
              value={tireIssues}
              onChangeText={setTireIssues}
              multiline
            />
          )}
        </View>

        {/* Lights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lights & Signals *</Text>

          <View style={styles.checkboxRow}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setLightsWorking(!lightsWorking)}
            >
              <View style={[styles.checkboxBox, lightsWorking && styles.checkboxBoxChecked]}>
                {lightsWorking && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>All lights and signals working</Text>
            </TouchableOpacity>
          </View>

          {lightsWorking && (
            <TextInput
              style={styles.textInput}
              placeholder="Any concerns? (optional)"
              value={lightsIssues}
              onChangeText={setLightsIssues}
              multiline
            />
          )}
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
            <Text style={styles.submitButtonText}>Complete Pre-Trip Inspection</Text>
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
