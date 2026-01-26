import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker'
import { db } from '@/components/providers/SystemProvider';
import { executeTypedMutation } from '@/library/powersync/typedMutation';

interface EditProfileDocsProps {
  driverId: string | null;
  licensePath: string | null;
  insurancePath: string | null;
  medicalCardPath: string | null;
  onClose: () => void;
}

interface DocumentPhoto {
  uri: string | null;
  base64?: string;
}

export default function EditProfileDocs({
  driverId,
  licensePath,
  insurancePath,
  medicalCardPath,
  onClose,
}: EditProfileDocsProps) {
  const [licensePhoto, setLicensePhoto] = useState<DocumentPhoto>({ uri: licensePath });
  const [insurancePhoto, setInsurancePhoto] = useState<DocumentPhoto>({ uri: insurancePath });
  const [medicalCardPhoto, setMedicalCardPhoto] = useState<DocumentPhoto>({ uri: medicalCardPath });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickImageFromLibrary = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to select photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setter({
        uri: result.assets[0].uri,
        base64: 'base64',
      });
    }
  };

  const takePhoto = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera permissions to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setter({
        uri: result.assets[0].uri,
        base64: 'base64',
      });
    }
  };

  const pickFile = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>
  ) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });

    if (!result.canceled && result.assets[0]) {
      setter({
        uri: result.assets[0].uri,
      });
    }
  };


  const handleSubmit = async () => {
    if (!driverId) {
      Alert.alert('Error', 'Driver ID not found');
      return;
    }

    setIsSubmitting(true);

    try {
      // TODO: Upload photos to storage and get paths
      // For now, we'll just update with the existing paths or new URIs
      const updateQuery = db
        .updateTable('Drivers')
        .set({
          license_photo_path: licensePhoto.uri,
          insurance_photo_path: insurancePhoto.uri,
          medical_card_photo_path: medicalCardPhoto.uri,
        })
        .where('id', '=', driverId)
        .compile();

      await executeTypedMutation(updateQuery);

      Alert.alert('Success', 'Documents updated successfully!', [
        { text: 'OK', onPress: onClose }
      ]);
    } catch (error) {
      console.error('Error updating documents:', error);
      Alert.alert('Error', 'Failed to update documents. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDocumentSection = (
    title: string,
    icon: string,
    photo: DocumentPhoto,
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>
  ) => (
    <View style={styles.documentSection}>
      <View style={styles.documentHeader}>
        <Text style={styles.documentIcon}>{icon}</Text>
        <Text style={styles.documentTitle}>{title}</Text>
      </View>

      {photo.uri ? (
        <View style={styles.photoContainer}>
          <Image source={{ uri: photo.uri }} style={styles.photo} />
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => setter({ uri: null })}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.emptyPhotoContainer}>
          <Text style={styles.emptyPhotoText}>No photo uploaded</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={() => takePhoto(setter)}
        >
          <Text style={styles.photoButtonText}>📷 Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={() => pickImageFromLibrary(setter)}
        >
          <Text style={styles.photoButtonText}>🖼️ Choose Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={() => pickFile(setter)}
        >
          <Text style={styles.photoButtonText}>📎 Choose File</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Documents</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderDocumentSection(
            "Driver's License",
            "🪪",
            licensePhoto,
            setLicensePhoto
          )}
          
          {renderDocumentSection(
            "Certificate of Insurance",
            "🛡️",
            insurancePhoto,
            setInsurancePhoto
          )}
          
          {renderDocumentSection(
            "Medical Card",
            "🏥",
            medicalCardPhoto,
            setMedicalCardPhoto
          )}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cancelButton: {
    fontSize: 16,
    color: '#0A84FF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  scrollContent: {
    padding: 16,
  },
  documentSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  documentIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  photoContainer: {
    marginBottom: 12,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyPhotoContainer: {
    height: 200,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyPhotoText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  photoButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#A8E6B7',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});