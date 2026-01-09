import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/library/supabase/supabaseClient';
import * as ImagePicker from 'expo-image-picker';

type InspectionType = 'pickup' | 'dropoff';

interface InspectionScreenProps {
  workTrackerId: number;
  inspectionType: InspectionType;
  onComplete: () => void;
  onCancel: () => void;
}

export default function InspectionScreen({ 
  workTrackerId, 
  inspectionType, 
  onComplete, 
  onCancel 
}: InspectionScreenProps) {
  const [walkAroundComplete, setWalkAroundComplete] = useState(false);
  const [issuesFound, setIssuesFound] = useState(false);
  const [issueDescription, setIssueDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
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
    });

    if (!result.canceled && result.assets) {
      const newPhotos = result.assets.map(asset => asset.uri);
      setPhotos([...photos, ...newPhotos]);
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
    });

    if (!result.canceled && result.assets[0]) {
      setPhotos([...photos, result.assets[0].uri]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validation
    // if (!walkAroundComplete) {
    //   Alert.alert('Walk-around Required', 'Please confirm you completed the walk-around inspection');
    //   return;
    // }

    // if (issuesFound && !issueDescription.trim()) {
    //   Alert.alert('Description Required', 'Please describe the issues found');
    //   return;
    // }

    // if (photos.length === 0) {
    //   Alert.alert('Photo Required', 'Please add at least one photo for documentation');
    //   return;
    // }

    setIsSubmitting(true);

    try {
    //   const inspectionId = `insp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    //   const photoPaths: string[] = [];
    //   for (let i = 0; i < photos.length; i++) {
    //     const photoUri = photos[i];
    //     const fileName = `${inspectionId}_photo_${i}.jpg`;
    //     const storagePath = `inspections/${workTrackerId}/${fileName}`;
        
    //     // TODO: Upload to Supabase Storage
    //     photoPaths.push(storagePath);
    //   }

    //   const { error: inspectionError } = await supabase
    //     .from('WorkTrackerInspections')
    //     .insert({
    //       inspection_id: inspectionId,
    //       created_at: new Date().toISOString(),
    //       walk_around_complete: walkAroundComplete ? 1 : 0,
    //       issues_found: issuesFound ? 1 : 0,
    //       issue_description: issueDescription || null,
    //       optional_photo_ids: photoPaths.join(','),
    //     });

    //   if (inspectionError) throw inspectionError;

    //   if (photoPaths.length > 0) {
    //     const photoRecords = photoPaths.map(path => ({
    //       storage_path: path,
    //       inspection_id: inspectionId,
    //     }));

    //     const { error: photoError } = await supabase
    //       .from('InspectionPhotos')
    //       .insert(photoRecords);

    //     if (photoError) throw photoError;
    //   }

    //   const updateData: any = {};
      
    //   if (inspectionType === 'pickup') {
    //     updateData.pre_inspection_id = inspectionId;
    //     updateData.status = 'dest_dropoff';
    //     updateData.pickup_completed_at = new Date().toISOString();
    //   } else {
    //     updateData.post_inspection_id = inspectionId;
    //     updateData.status = 'completed';
    //     updateData.completed_at = new Date().toISOString();
    //   }

    //   const { error: updateError } = await supabase
    //     .from('WorkTrackers')
    //     .update(updateData)
    //     .eq('work_tracker_id', workTrackerId);

    //   if (updateError) throw updateError;

      Alert.alert(
        'Success',
        `${inspectionType === 'pickup' ? 'Pickup' : 'Dropoff'} inspection completed!`,
        [{ text: 'OK', onPress: onComplete }]
      );

    } catch (error) {
      console.error('Error submitting inspection:', error);
      Alert.alert('Error', 'Failed to submit inspection. Please try again.');
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
          <Text style={styles.subtitle}>
            Complete the inspection before proceeding
          </Text>
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
            onPress={() => setWalkAroundComplete(!walkAroundComplete)}
          >
            <Text style={styles.checkboxLabel}>
              I have completed a full walk-around inspection
            </Text>
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
            onPress={() => setIssuesFound(!issuesFound)}
          >
            <Text style={styles.checkboxLabel}>
              Issues or damage found
            </Text>
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
            <Text style={styles.sectionTitle}>Photos</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>REQUIRED</Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
            At least 1 photo required for documentation
          </Text>

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
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => removePhoto(index)}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isSubmitting}
          >
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