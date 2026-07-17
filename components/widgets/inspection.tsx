import {
  InspectionQuestion,
  useInspectionQuestions,
} from "@/hooks/db/useInspectionQuestions";
import {
  DamageDetailsForm,
  DamageDetailsFormValues,
} from "@/features/damage-report/components/DamageDetailsForm";
import { EditablePhotoGrid } from "@/features/damage-report/components/EditablePhotoGrid";
import type { DocumentPhoto } from "@/features/damage-report/types";
import { createDamageReport } from "@/features/damage-report/utils/createDamageReport";
import {
  pickDamagePhotosFromCamera,
  pickDamagePhotosFromLibrary,
} from "@/features/damage-report/utils/pickDamagePhotos";
import { executeTypedMutation } from "@/library/powersync/typedMutation";
import { readAsBase64 } from "@/utils/readAsBase64";
import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  db,
  inspectionPhotoAttachmentQueue,
} from "../providers/SystemProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnswerMap = Record<
  string,
  {
    text?: string;
    checked?: boolean;
    photos?: DocumentPhoto[];
  }
>;

type InspectionType = "pickup" | "dropoff";

interface InspectionScreenProps {
  workTrackerId: string;
  bleacherUuid: string | null;
  inspectionType: InspectionType;
  onComplete: () => void;
  onCancel: () => void;
}

const INITIAL_DAMAGE_DETAILS: DamageDetailsFormValues = {
  seatDamage: null,
  haulDamage: null,
  note: "",
  photos: [],
};

// ─── Question renderers ───────────────────────────────────────────────────────

function TextQuestion({
  question,
  value,
  onChange,
}: {
  question: InspectionQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{question.question_text}</Text>
        {!!question.required && (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
        )}
      </View>
      <TextInput
        style={styles.textInput}
        multiline
        placeholder="Enter your answer..."
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

function CheckboxQuestion({
  question,
  value,
  onChange,
}: {
  question: InspectionQuestion;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{question.question_text}</Text>
        {!!question.required && (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[styles.checkbox, value && styles.checkboxChecked]}
        onPress={() => onChange(!value)}
      >
        <Text style={styles.checkboxLabel}>{question.question_text}</Text>
        {value && (
          <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />
        )}
      </TouchableOpacity>
    </View>
  );
}

function PhotoQuestion({
  question,
  photos,
  onAddFromCamera,
  onAddFromLibrary,
  onRemove,
}: {
  question: InspectionQuestion;
  photos: DocumentPhoto[];
  onAddFromCamera: () => void;
  onAddFromLibrary: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={styles.section}>
      <EditablePhotoGrid
        photos={photos}
        title={question.question_text ?? "Photos"}
        required={!!question.required}
        onAddFromCamera={onAddFromCamera}
        onAddFromLibrary={onAddFromLibrary}
        onRemove={onRemove}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InspectionScreen({
  workTrackerId,
  bleacherUuid,
  inspectionType,
  onComplete,
  onCancel,
}: InspectionScreenProps) {
  const { questions } = useInspectionQuestions();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const checkboxQuestions = questions.filter(
    (q) => q.question_type === "checkbox",
  );
  const allChecked = checkboxQuestions.every(
    (q) => answers[q.id]?.checked === true,
  );
  const [walkAroundComplete, setWalkAroundComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [damageFound, setDamageFound] = useState<boolean | null>(null);
  const [damageDetails, setDamageDetails] =
    useState<DamageDetailsFormValues>(INITIAL_DAMAGE_DETAILS);

  // ── Answer helpers ──────────────────────────────────────────────────────────

  const handleCheckAll = () => {
    const shouldCheckAll = !allChecked;
    setWalkAroundComplete(shouldCheckAll);
    const newAnswers = { ...answers };
    for (const q of checkboxQuestions) {
      newAnswers[q.id] = { ...newAnswers[q.id], checked: shouldCheckAll };
    }
    setAnswers(newAnswers);
  };

  const setTextAnswer = (questionId: string, text: string) =>
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], text },
    }));

  const setCheckboxAnswer = (questionId: string, checked: boolean) =>
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], checked },
    }));

  const addPhotosToQuestion = (
    questionId: string,
    newPhotos: DocumentPhoto[],
  ) =>
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        photos: [...(prev[questionId]?.photos ?? []), ...newPhotos],
      },
    }));

  const removePhotoFromQuestion = (questionId: string, index: number) =>
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        photos: (prev[questionId]?.photos ?? []).filter((_, i) => i !== index),
      },
    }));

  // ── Image pickers (inspection questions) ────────────────────────────────────

  const pickImageForQuestion = async (questionId: string) => {
    const picked = await pickDamagePhotosFromLibrary();
    if (picked.length > 0) addPhotosToQuestion(questionId, picked);
  };

  const takePhotoForQuestion = async (questionId: string) => {
    const picked = await pickDamagePhotosFromCamera();
    if (picked.length > 0) addPhotosToQuestion(questionId, picked);
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    for (const q of questions) {
      if (!q.required) continue;
      const answer = answers[q.id];

      if (q.question_type === "text" && !answer?.text?.trim()) {
        return `"${q.question_text}" is required`;
      }
      if (q.question_type === "checkbox" && !answer?.checked) {
        return `"${q.question_text}" must be checked`;
      }
      if (q.question_type === "photo" && !answer?.photos?.length) {
        return `"${q.question_text}" requires at least one photo`;
      }
    }

    if (damageFound === null) return "Please indicate if damage was found";

    if (damageFound === true) {
      if (!damageDetails.note.trim()) return "Damage notes are required";
      if (!damageDetails.photos.length)
        return "At least one damage photo is required";
    }

    return null;
  };

  // ── Photo upload helpers ────────────────────────────────────────────────────

  /** Saves an inspection-question photo → inspection-photos bucket. */
  const saveInspectionPhoto = async (
    photo: DocumentPhoto,
    inspectionId: string,
    questionId: string,
    photoIndex: number,
  ): Promise<string | null> => {
    if (!photo.isNew || !photo.uri) return photo.attachmentId ?? null;
    if (!inspectionPhotoAttachmentQueue) {
      console.warn("inspectionPhotoAttachmentQueue not initialized");
      return null;
    }
    const ext = photo.ext ?? "jpg";
    const filename = `${inspectionId}/${questionId}/photo_${photoIndex}_${Date.now()}.${ext}`;
    const base64 = await readAsBase64(photo.uri);
    const record = await inspectionPhotoAttachmentQueue.savePhoto(
      base64,
      filename,
    );
    return record.id;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert("Required", validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const inspectionId = randomUUID();
      const now = new Date().toISOString();

      const answersPayload: Record<
        string,
        {
          question_text: string | null;
          question_type: string | null;
          required: boolean;
          answer_text?: string | null;
          answer_boolean?: boolean | null;
          photos?: { storage_path: string }[];
        }
      > = {};

      for (const question of questions) {
        const answer = answers[question.id];

        if (question.question_type === "text") {
          answersPayload[question.id] = {
            question_text: question.question_text,
            question_type: "text",
            required: !!question.required,
            answer_text: answer?.text?.trim() ?? null,
          };
        } else if (question.question_type === "checkbox") {
          answersPayload[question.id] = {
            question_text: question.question_text,
            question_type: "checkbox",
            required: !!question.required,
            answer_boolean: answer?.checked ?? false,
          };
        } else if (question.question_type === "photo") {
          const photos = answer?.photos ?? [];
          const uploadedPhotos: { storage_path: string }[] = [];

          for (let i = 0; i < photos.length; i++) {
            const storagePath = await saveInspectionPhoto(
              photos[i],
              inspectionId,
              question.id,
              i,
            );
            if (storagePath) uploadedPhotos.push({ storage_path: storagePath });
          }

          answersPayload[question.id] = {
            question_text: question.question_text,
            question_type: "photo",
            required: !!question.required,
            photos: uploadedPhotos,
          };
        }
      }

      await executeTypedMutation(
        db
          .insertInto("WorkTrackerInspections")
          .values({
            id: inspectionId,
            created_at: now,
            walk_around_complete: walkAroundComplete ? 1 : 0,
            issues_found: damageFound ? 1 : 0,
            issue_description: null,
            answers_json: JSON.stringify(answersPayload),
          })
          .compile(),
      );

      if (damageFound) {
        await createDamageReport({
          bleacherUuid,
          inspectionUuid: inspectionId,
          seatDamage: damageDetails.seatDamage,
          haulDamage: damageDetails.haulDamage,
          note: damageDetails.note,
          photos: damageDetails.photos,
        });
      }

      const inspectionField =
        inspectionType === "pickup"
          ? { pre_inspection_uuid: inspectionId }
          : { post_inspection_uuid: inspectionId };

      await executeTypedMutation(
        db
          .updateTable("WorkTrackers")
          .set({ ...inspectionField, updated_at: now })
          .where("id", "=", workTrackerId)
          .compile(),
      );

      Alert.alert(
        "Success",
        `${inspectionType === "pickup" ? "Pickup" : "Dropoff"} inspection completed successfully!`,
        [{ text: "OK", onPress: onComplete }],
      );
    } catch (error) {
      console.error("Error submitting inspection:", error);
      Alert.alert(
        "Error",
        `Failed to submit: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {inspectionType === "pickup" ? "Pickup" : "Dropoff"} Inspection
          </Text>
          <Text style={styles.subtitle}>
            Complete the inspection before proceeding
          </Text>
        </View>

        {checkboxQuestions.length > 0 && (
          <TouchableOpacity
            style={[
              styles.checkAllButton,
              allChecked && styles.checkAllButtonChecked,
            ]}
            onPress={handleCheckAll}
          >
            <Ionicons
              name={
                allChecked
                  ? "checkmark-done-circle"
                  : "checkmark-done-circle-outline"
              }
              size={20}
              color={allChecked ? "#34C759" : "#0A84FF"}
            />
            <Text
              style={[
                styles.checkAllText,
                allChecked && styles.checkAllTextChecked,
              ]}
            >
              {allChecked ? "All Items Checked" : "Check All Items"}
            </Text>
          </TouchableOpacity>
        )}

        {questions.map((question) => {
          if (question.question_type === "text") {
            return (
              <TextQuestion
                key={question.id}
                question={question}
                value={answers[question.id]?.text ?? ""}
                onChange={(v) => setTextAnswer(question.id, v)}
              />
            );
          }
          if (question.question_type === "checkbox") {
            return (
              <CheckboxQuestion
                key={question.id}
                question={question}
                value={answers[question.id]?.checked ?? false}
                onChange={(v) => setCheckboxAnswer(question.id, v)}
              />
            );
          }
          if (question.question_type === "photo") {
            return (
              <PhotoQuestion
                key={question.id}
                question={question}
                photos={answers[question.id]?.photos ?? []}
                onAddFromCamera={() => takePhotoForQuestion(question.id)}
                onAddFromLibrary={() => pickImageForQuestion(question.id)}
                onRemove={(index) =>
                  removePhotoFromQuestion(question.id, index)
                }
              />
            );
          }
          return null;
        })}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Was damage found?</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <TouchableOpacity
              style={[
                styles.damageToggle,
                damageFound === true && styles.damageToggleYes,
              ]}
              onPress={() => setDamageFound(true)}
            >
              <Ionicons
                name="warning"
                size={18}
                color={damageFound === true ? "#FF3B30" : "#8E8E93"}
              />
              <Text
                style={[
                  styles.damageToggleText,
                  damageFound === true && { color: "#FF3B30" },
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.damageToggle,
                damageFound === false && styles.damageToggleNo,
              ]}
              onPress={() => setDamageFound(false)}
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={damageFound === false ? "#34C759" : "#8E8E93"}
              />
              <Text
                style={[
                  styles.damageToggleText,
                  damageFound === false && { color: "#34C759" },
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {damageFound === true && (
          <DamageDetailsForm
            values={damageDetails}
            onChange={(patch) =>
              setDamageDetails((prev) => ({ ...prev, ...patch }))
            }
          />
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.submitButton,
              isSubmitting && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? "Submitting..." : "Complete Inspection"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  scrollContent: { padding: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "700", color: "#000", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#8E8E93" },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  requiredBadge: {
    flexShrink: 0,
    backgroundColor: "#FF3B30",
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
  checkAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EBF5FF",
    borderWidth: 1.5,
    borderColor: "#0A84FF",
    borderRadius: 10,
    paddingVertical: 13,
    marginBottom: 8,
  },
  checkAllButtonChecked: { backgroundColor: "#E8F9ED", borderColor: "#34C759" },
  checkAllText: { fontSize: 15, fontWeight: "600", color: "#0A84FF" },
  checkAllTextChecked: { color: "#34C759" },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  checkboxChecked: { borderColor: "#0A84FF", backgroundColor: "#EBF5FF" },
  checkboxLabel: { flex: 1, fontSize: 15, color: "#000", marginRight: 8 },
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
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: { fontSize: 16, fontWeight: "600", color: "#000" },
  submitButton: {
    flex: 2,
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonDisabled: { backgroundColor: "#A8E6B7" },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  damageToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8F8F8",
  },
  damageToggleYes: { borderColor: "#FF3B30", backgroundColor: "#FFEBEA" },
  damageToggleNo: { borderColor: "#34C759", backgroundColor: "#E8F9ED" },
  damageToggleText: { fontSize: 15, fontWeight: "600", color: "#8E8E93" },
});
