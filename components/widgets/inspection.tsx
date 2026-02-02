import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { db, inspectionPhotoAttachmentQueue } from '../providers/SystemProvider';
import { executeTypedMutation } from '@/library/powersync/typedMutation';

interface DocumentPhoto {
  uri: string | null;
  base64?: string;
  /** The attachment ID stored in the InspectionPhotos table (doubles as the storage path reference) */
  attachmentId?: string | null;
  /** True if this photo was newly picked/taken and needs uploading */
  isNew?: boolean;
  /** File extension extracted from the source URI (e.g. "jpg", "png", "pdf") */
  ext?: string;
}

// Simple UUID v4 generator for React Native
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

type InspectionType = 'pickup' | 'dropoff';

interface InspectionScreenProps {
  workTrackerId: string;
  inspectionType: InspectionType;
  onComplete: () => void;
  onCancel: () => void;
}

export default function InspectionScreen({
  workTrackerId,
  inspectionType,
  onComplete,
  onCancel,
}: InspectionScreenProps) {
  const [walkAroundComplete, setWalkAroundComplete] = useState(false);
  const [issuesFound, setIssuesFound] = useState(false);
  const [issueDescription, setIssueDescription] = useState('');
  const [photos, setPhotos] = useState<DocumentPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickImage = async () => {
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
      const newPhotos: DocumentPhoto[] = result.assets.map(asset => {
        const ext = getExtFromUri(asset.uri) ?? 'jpg';
        return {
          uri: asset.uri,
          base64: asset.base64 ?? undefined,
          isNew: true,
          ext,
        };
      });
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera permissions to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      const ext = getExtFromUri(asset.uri) ?? 'jpg';
      setPhotos(prev => [
        ...prev,
        {
          uri: asset.uri,
          base64: asset.base64 ?? undefined,
          isNew: true,
          ext,
        },
      ]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Save a photo through the attachment queue.
   * Returns the filename used as the storage path (stored in the InspectionPhotos table).
   */
  const savePhotoToQueue = async (
    photo: DocumentPhoto,
    inspectionId: string,
    photoIndex: number,
  ): Promise<string | null> => {
    if (!photo.isNew || !photo.base64) return photo.attachmentId ?? null;
    if (!inspectionPhotoAttachmentQueue) {
      console.warn('inspectionPhotoAttachmentQueue not initialized');
      return null;
    }

    const ext = photo.ext ?? 'jpg';
    const ts = Date.now();
    const filename = `${inspectionId}/photo_${photoIndex}_${ts}.${ext}`;
    const record = await inspectionPhotoAttachmentQueue.savePhoto(photo.base64, filename);
    return record.id;
  };

  const handleSubmit = async () => {
    if (!walkAroundComplete) {
      Alert.alert('Walk-around Required', 'Please confirm you completed the walk-around inspection');
      return;
    }

    if (issuesFound && !issueDescription.trim()) {
      Alert.alert('Description Required', 'Please describe the issues found');
      return;
    }

    if (photos.length === 0) {
      Alert.alert('Photo Required', 'Please add at least one photo for documentation');
      return;
    }

    setIsSubmitting(true);

    try {
      const inspectionId = generateUUID();
      const now = new Date().toISOString();

      console.log('Starting inspection submission...', { inspectionId, workTrackerId, inspectionType });

      // 1️⃣ Insert inspection record
      const insertInspectionQuery = db
        .insertInto('WorkTrackerInspections')
        .values({
          id: inspectionId,
          created_at: now,
          walk_around_complete: walkAroundComplete ? 1 : 0,
          issues_found: issuesFound ? 1 : 0,
          issue_description: issueDescription.trim() || null,
        })
        .compile();

      await executeTypedMutation(insertInspectionQuery);
      console.log('Inspection record created');

      // 2️⃣ Queue photos for upload via the attachment queue
      const photoStoragePaths = await Promise.all(
        photos.map((photo, index) => savePhotoToQueue(photo, inspectionId, index))
      );

      // 3️⃣ Insert photo records with attachment queue paths
      for (let index = 0; index < photos.length; index++) {
        const storagePath = photoStoragePaths[index];

        if (!storagePath) {
          console.warn(`Photo ${index} missing storage path, skipping`);
          continue;
        }

        try {
          const photoId = generateUUID();

          const insertPhotoQuery = db
            .insertInto('InspectionPhotos')
            .values({
              id: photoId,
              created_at: now,
              inspection_uuid: inspectionId,
              storage_path: storagePath,
              caption: null,
            })
            .compile();

          await executeTypedMutation(insertPhotoQuery);
          console.log(`Photo ${index + 1} record saved: ${photoId}`);
        } catch (error) {
          console.error(`Error saving photo record ${index + 1}:`, error);
          throw error;
        }
      }

      console.log(`All ${photos.length} photos queued for upload`);

      // 4️⃣ Update WorkTracker with inspection ID
      if (inspectionType === 'pickup') {
        const updateQuery = db
          .updateTable('WorkTrackers')
          .set({
            pre_inspection_uuid: inspectionId,
            updated_at: now,
          })
          .where('id', '=', workTrackerId)
          .compile();

        await executeTypedMutation(updateQuery);
      } else {
        const updateQuery = db
          .updateTable('WorkTrackers')
          .set({
            post_inspection_uuid: inspectionId,
            updated_at: now,
          })
          .where('id', '=', workTrackerId)
          .compile();

        await executeTypedMutation(updateQuery);
      }

      console.log('WorkTracker updated');

      Alert.alert(
        'Success',
        `${inspectionType === 'pickup' ? 'Pickup' : 'Dropoff'} inspection completed with ${photos.length} photo(s)!`,
        [{ text: 'OK', onPress: onComplete }]
      );
    } catch (error) {
      console.error('Error submitting inspection:', error);
      Alert.alert(
        'Error',
        `Failed to submit inspection: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {inspectionType === 'pickup' ? 'Pickup' : 'Dropoff'} Inspection
          </Text>
          <Text style={styles.subtitle}>Complete the inspection before proceeding</Text>
        </View>

        {/* Walk-around Complete */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Walk-around Inspection</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>REQUIRED</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.checkbox, walkAroundComplete && styles.checkboxChecked]}
            onPress={() => setWalkAroundComplete(v => !v)}
          >
            <Text style={styles.checkboxLabel}>I have completed a full walk-around inspection</Text>
            {walkAroundComplete && (
              <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Issues Found */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issues or Damage</Text>

          <TouchableOpacity
            style={[styles.checkbox, issuesFound && styles.checkboxChecked]}
            onPress={() => setIssuesFound(v => !v)}
          >
            <Text style={styles.checkboxLabel}>Issues or damage found</Text>
            {issuesFound && (
              <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />
            )}
          </TouchableOpacity>

          {issuesFound && (
            <View style={styles.textInputContainer}>
              <Text style={styles.inputLabel}>Describe the issues: *</Text>
              <TextInput
                style={styles.textInput}
                multiline
                placeholder="Describe any damage, issues, or concerns..."
                value={issueDescription}
                onChangeText={setIssueDescription}
              />
            </View>
          )}
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>REQUIRED</Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>At least 1 photo required for documentation</Text>

          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
              <View style={styles.iconContainer}>
                <Ionicons name="camera" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.photoButtonText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
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
                    onPress={() => removePhoto(index)}
                  >
                    <Ionicons name="close" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit Buttons */}
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

function getExtFromUri(uri: string): string | undefined {
  const match = uri.match(/\.(\w+)$/);
  return match?.[1]?.toLowerCase();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  requiredBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  checkboxChecked: {
    borderColor: '#0A84FF',
    backgroundColor: '#EBF5FF',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  textInputContainer: {
    marginTop: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#0A84FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  photoButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoContainer: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginLeft: 8
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#A8E6B7',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});