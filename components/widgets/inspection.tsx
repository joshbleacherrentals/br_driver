import { InspectionQuestion, useInspectionQuestions } from '@/hooks/db/useInspectionQuestions';
import { executeTypedMutation } from '@/library/powersync/typedMutation';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db, inspectionPhotoAttachmentQueue } from '../providers/SystemProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentPhoto {
  uri: string | null;
  base64?: string;
  attachmentId?: string | null;
  isNew?: boolean;
  ext?: string;
}

/** One answer entry keyed by question ID */
type AnswerMap = Record<string, {
  text?: string;
  checked?: boolean;
  photos?: DocumentPhoto[];
}>;

type InspectionType = 'pickup' | 'dropoff';

interface InspectionScreenProps {
  workTrackerId: string;
  inspectionType: InspectionType;
  onComplete: () => void;
  onCancel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getExtFromUri(uri: string): string | undefined {
  return uri.match(/\.(\w+)$/)?.[1]?.toLowerCase();
}

const GOOGLE_FORM_URL = 'https://forms.gle/dUSERuQ2UGSCVpoHA';

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
        {value && <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />}
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
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>
          {question.question_text} ({photos.length})
        </Text>
        {!!question.required && (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
        )}
      </View>

      <View style={styles.photoButtons}>
        <TouchableOpacity style={styles.photoButton} onPress={onAddFromCamera}>
          <View style={styles.iconContainer}>
            <Ionicons name="camera" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.photoButtonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={onAddFromLibrary}>
          <View style={styles.iconContainer}>
            <Ionicons name="images" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.photoButtonText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>

      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoContainer}>
              <Image source={{ uri: photo.uri ?? undefined }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => onRemove(index)}
              >
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InspectionScreen({
  workTrackerId,
  inspectionType,
  onComplete,
  onCancel,
}: InspectionScreenProps) {
  const { questions } = useInspectionQuestions();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const checkboxQuestions = questions.filter((q) => q.question_type === 'checkbox');
  const allChecked =
    checkboxQuestions.every((q) => answers[q.id]?.checked === true);
  const [walkAroundComplete, setWalkAroundComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], text } }));

  const setCheckboxAnswer = (questionId: string, checked: boolean) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], checked } }));

  const addPhotosToQuestion = (questionId: string, newPhotos: DocumentPhoto[]) =>
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

  // ── Image pickers (scoped per question) ────────────────────────────────────

  const pickImageForQuestion = async (questionId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to add photos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets?.length) {
      const newPhotos: DocumentPhoto[] = result.assets.map((asset) => ({
        uri: asset.uri,
        base64: asset.base64 ?? undefined,
        isNew: true,
        ext: getExtFromUri(asset.uri) ?? 'jpg',
      }));
      addPhotosToQuestion(questionId, newPhotos);
    }
  };

  const takePhotoForQuestion = async (questionId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera permissions to take photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      addPhotosToQuestion(questionId, [{
        uri: asset.uri,
        base64: asset.base64 ?? undefined,
        isNew: true,
        ext: getExtFromUri(asset.uri) ?? 'jpg',
      }]);
    }
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    for (const q of questions) {
      if (!q.required) continue;
      const answer = answers[q.id];

      if (q.question_type === 'text' && !answer?.text?.trim()) {
        return `"${q.question_text}" is required`;
      }
      if (q.question_type === 'checkbox' && !answer?.checked) {
        return `"${q.question_text}" must be checked`;
      }
      if (q.question_type === 'photo' && !answer?.photos?.length) {
        return `"${q.question_text}" requires at least one photo`;
      }
    }
    return null;
  };

  // ── Photo upload helper ─────────────────────────────────────────────────────

  const savePhotoToQueue = async (
    photo: DocumentPhoto,
    inspectionId: string,
    questionId: string,
    photoIndex: number,
  ): Promise<string | null> => {
    if (!photo.isNew || !photo.base64) return photo.attachmentId ?? null;
    if (!inspectionPhotoAttachmentQueue) {
      console.warn('inspectionPhotoAttachmentQueue not initialized');
      return null;
    }
    const ext = photo.ext ?? 'jpg';
    const filename = `${inspectionId}/${questionId}/photo_${photoIndex}_${Date.now()}.${ext}`;
    const record = await inspectionPhotoAttachmentQueue.savePhoto(photo.base64, filename);
    return record.id;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
  const validationError = validate();
  if (validationError) {
    Alert.alert('Required', validationError);
    return;
  }

  setIsSubmitting(true);

  try {
    const inspectionId = generateUUID();
    const now = new Date().toISOString();

    // 1️⃣ Build the answers JSON — keyed by question ID, stores question text
    //    alongside the answer so the record is self-describing even if questions change
    const answersPayload: Record<string, {
      question_text: string | null;
      question_type: string | null;
      required: boolean;
      answer_text?: string | null;
      answer_boolean?: boolean | null;
      photos?: { storage_path: string }[];
    }> = {};

    for (const question of questions) {
      const answer = answers[question.id];

      if (question.question_type === 'text') {
        answersPayload[question.id] = {
          question_text: question.question_text,
          question_type: 'text',
          required: !!question.required,
          answer_text: answer?.text?.trim() ?? null,
        };

      } else if (question.question_type === 'checkbox') {
        answersPayload[question.id] = {
          question_text: question.question_text,
          question_type: 'checkbox',
          required: !!question.required,
          answer_boolean: answer?.checked ?? false,
        };

      } else if (question.question_type === 'photo') {
        const photos = answer?.photos ?? [];

        // Upload photos and collect storage paths
        const uploadedPhotos: { storage_path: string }[] = [];
        for (let i = 0; i < photos.length; i++) {
          const storagePath = await savePhotoToQueue(photos[i], inspectionId, question.id, i);
          if (storagePath) {
            uploadedPhotos.push({ storage_path: storagePath });
          }
        }

        answersPayload[question.id] = {
          question_text: question.question_text,
          question_type: 'photo',
          required: !!question.required,
          photos: uploadedPhotos,
        };
      }
    }

    // 2️⃣ Insert inspection record with answers embedded as JSON
    await executeTypedMutation(
      db.insertInto('WorkTrackerInspections')
        .values({
          id: inspectionId,
          created_at: now,
          walk_around_complete: walkAroundComplete ? 1 : 0,
          issues_found: 0,
          issue_description: null,
          answers_json: JSON.stringify(answersPayload),
        })
        .compile()
    );

    // 3️⃣ Update WorkTracker
    const inspectionField = inspectionType === 'pickup'
      ? { pre_inspection_uuid: inspectionId }
      : { post_inspection_uuid: inspectionId };

    await executeTypedMutation(
      db.updateTable('WorkTrackers')
        .set({ ...inspectionField, updated_at: now })
        .where('id', '=', workTrackerId)
        .compile()
    );

    Alert.alert(
      'Success',
      `${inspectionType === 'pickup' ? 'Pickup' : 'Dropoff'} inspection completed successfully!`,
      [{ text: 'OK', onPress: onComplete }]
    );

  } catch (error) {
    console.error('Error submitting inspection:', error);
    Alert.alert('Error', `Failed to submit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    setIsSubmitting(false);
  }
};

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {inspectionType === 'pickup' ? 'Pickup' : 'Dropoff'} Inspection
          </Text>
          <Text style={styles.subtitle}>Complete the inspection before proceeding</Text>
        </View>

        {/* Check All button — only shown if there are checkbox questions */}
        {checkboxQuestions.length > 0 && (
          <TouchableOpacity
            style={[styles.checkAllButton, allChecked && styles.checkAllButtonChecked]}
            onPress={handleCheckAll}
          >
            <Ionicons
              name={allChecked ? 'checkmark-done-circle' : 'checkmark-done-circle-outline'}
              size={20}
              color={allChecked ? '#34C759' : '#0A84FF'}
            />
            <Text style={[styles.checkAllText, allChecked && styles.checkAllTextChecked]}>
              {allChecked ? 'All Items Checked' : 'Check All Items'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Dynamic questions */}
        {questions.map((question) => {
          if (question.question_type === 'text') {
            return (
              <TextQuestion
                key={question.id}
                question={question}
                value={answers[question.id]?.text ?? ''}
                onChange={(v) => setTextAnswer(question.id, v)}
              />
            );
          }
          if (question.question_type === 'checkbox') {
            return (
              <CheckboxQuestion
                key={question.id}
                question={question}
                value={answers[question.id]?.checked ?? false}
                onChange={(v) => setCheckboxAnswer(question.id, v)}
              />
            );
          }
          if (question.question_type === 'photo') {
            return (
              <PhotoQuestion
                key={question.id}
                question={question}
                photos={answers[question.id]?.photos ?? []}
                onAddFromCamera={() => takePhotoForQuestion(question.id)}
                onAddFromLibrary={() => pickImageForQuestion(question.id)}
                onRemove={(index) => removePhotoFromQuestion(question.id, index)}
              />
            );
          }
          return null;
        })}

        {/* Submit */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : 'Complete Inspection'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// (unchanged from original — paste your existing StyleSheet here)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scrollContent: { padding: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#000', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#8E8E93' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#000' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  requiredBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  requiredText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  sectionSubtitle: { fontSize: 14, color: '#8E8E93', marginBottom: 12 },
  bold: { fontWeight: '700', color: '#3C3C3C' },
  formLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EBF5FF', borderWidth: 1, borderColor: '#0A84FF', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12 },
  formLinkText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0A84FF' },
  checkAllButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: '#EBF5FF',
  borderWidth: 1.5,
  borderColor: '#0A84FF',
  borderRadius: 10,
  paddingVertical: 13,
  marginBottom: 8,
},
  checkAllButtonChecked: {
    backgroundColor: '#E8F9ED',
    borderColor: '#34C759',
  },
  checkAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A84FF',
  },
  checkAllTextChecked: {
    color: '#34C759',
  },
  checkbox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F8F8F8', borderRadius: 8, borderWidth: 2, borderColor: '#E5E7EB' },
  checkboxChecked: { borderColor: '#0A84FF', backgroundColor: '#EBF5FF' },
  checkboxLabel: { flex: 1, fontSize: 15, color: '#000', marginRight: 8 },
  textInput: { backgroundColor: '#F8F8F8', borderRadius: 8, padding: 12, fontSize: 16, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB' },
  photoButtons: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  photoButton: { flex: 1, backgroundColor: '#0A84FF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  photoButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoContainer: { position: 'relative', width: 100, height: 100 },
  iconContainer: { width: 24, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginLeft: 8 },
  photo: { width: '100%', height: '100%', borderRadius: 8 },
  removePhotoButton: { position: 'absolute', top: -8, right: -8, backgroundColor: '#FF3B30', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonContainer: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 32 },
  cancelButton: { flex: 1, backgroundColor: '#F2F2F7', padding: 16, borderRadius: 8, alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#000' },
  submitButton: { flex: 2, backgroundColor: '#34C759', padding: 16, borderRadius: 8, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#A8E6B7' },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});