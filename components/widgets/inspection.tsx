import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../providers/SystemProvider';
import { executeTypedMutation } from '@/library/powersync/typedMutation';
import * as ImageManipulator from 'expo-image-manipulator';

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

interface PhotoData {
  uri: string;
  base64?: string;
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
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to add photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.length) {
      const newPhotos: PhotoData[] = result.assets.map(asset => ({
        uri: asset.uri,
        base64: asset.base64 ?? undefined,
      }));
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
      setPhotos(prev => [
        ...prev,
        {
          uri: asset.uri,
          base64: asset.base64 ?? undefined,
        },
      ]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
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

    // 2️⃣ Process photos sequentially to prevent OOM
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index];

      if (!photo.base64) {
        console.warn(`Photo ${index} missing base64 data, skipping`);
        continue;
      }

      try {
        const photoId = generateUUID();

        // Compress and resize image
        const manipulated = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 1024 } }], // max width 1024px
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        const storagePath = `data:image/jpeg;base64,${manipulated.base64}`;

        // Save to PowerSync DB
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
        console.log(`Photo ${index + 1} saved: ${photoId}`);
      } catch (error) {
        console.error(`Error processing photo ${index + 1}:`, error);
        throw error;
      }
    }

    console.log(`All ${photos.length} photos saved`);

    // 3️⃣ Update WorkTracker with inspection ID
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
    <SafeAreaView style={styles.container}>
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
            {walkAroundComplete && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Issues Found */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Issues or Damage</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>REQUIRED</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.checkbox, issuesFound && styles.checkboxChecked]}
            onPress={() => setIssuesFound(v => !v)}
          >
            <Text style={styles.checkboxLabel}>Issues or damage found</Text>
            {issuesFound && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>

          {issuesFound && (
            <View style={styles.textInputContainer}>
              <Text style={styles.inputLabel}>Describe the issues: *</Text>
              <TextInput
                style={styles.textInput}
                multiline
                numberOfLines={4}
                placeholder="Enter detailed description of issues..."
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
              <Text style={styles.photoButtonText}>📷 Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
              <Text style={styles.photoButtonText}>🖼️ Choose from Library</Text>
            </TouchableOpacity>
          </View>

          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                  <TouchableOpacity style={styles.removePhotoButton} onPress={() => removePhoto(index)}>
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isSubmitting}>
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
  checkmark: {
    fontSize: 24,
    color: '#0A84FF',
    fontWeight: '700',
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
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
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
  removePhotoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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