import { db, photoAttachmentQueue } from "@/components/providers/SystemProvider";
import { executeTypedMutation } from "@/library/powersync/typedMutation";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface EditProfileDocsProps {
  showMedCard: boolean;
  driverId: string | null;
  licensePath: string | null;
  insurancePath: string | null;
  medicalCardPath: string | null;
  onClose: () => void;
}

interface DocumentPhoto {
  uri: string | null;
  base64?: string;
  /** The attachment ID stored in the Drivers table (doubles as the storage path reference) */
  attachmentId?: string | null;
  /** True if this photo was newly picked/taken and needs uploading */
  isNew?: boolean;
  /** File extension extracted from the source URI (e.g. "jpg", "png", "pdf") */
  ext?: string;
}

export default function EditProfileDocs({
  showMedCard,
  driverId,
  licensePath,
  insurancePath,
  medicalCardPath,
  onClose,
}: EditProfileDocsProps) {
  const [licensePhoto, setLicensePhoto] = useState<DocumentPhoto>({
    uri: licensePath ? getLocalUriForAttachment(licensePath) : null,
    attachmentId: licensePath,
  });
  const [insurancePhoto, setInsurancePhoto] = useState<DocumentPhoto>({
    uri: insurancePath ? getLocalUriForAttachment(insurancePath) : null,
    attachmentId: insurancePath,
  });
  const [medicalCardPhoto, setMedicalCardPhoto] = useState<DocumentPhoto>({
    uri: medicalCardPath ? getLocalUriForAttachment(medicalCardPath) : null,
    attachmentId: medicalCardPath,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickImageFromLibrary = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("Permission needed", "We need camera roll permissions to select photos");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const ext = getExtFromUri(result.assets[0].uri) ?? "jpg";
      setter({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64 ?? undefined,
        isNew: true,
        ext,
      });
    }
  };

  const takePhoto = async (setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert("Permission needed", "We need camera permissions to take photos");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const ext = getExtFromUri(result.assets[0].uri) ?? "jpg";
      setter({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64 ?? undefined,
        isNew: true,
        ext,
      });
    }
  };

  const pickFile = async (setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["image/*", "application/pdf"],
    });

    if (!result.canceled && result.assets[0]) {
      // Read the file as base64 so it can be queued for upload
      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const ext = getExtFromUri(result.assets[0].uri) ?? "jpg";
      setter({
        uri: result.assets[0].uri,
        base64,
        isNew: true,
        ext,
      });
    }
  };

  /**
   * Save a photo through the attachment queue.
   * Returns the filename used as the storage path (stored in the Drivers table).
   */
  const savePhotoToQueue = async (
    photo: DocumentPhoto,
    docType: string,
  ): Promise<string | null> => {
    if (!photo.isNew || !photo.base64 || !driverId) return photo.attachmentId ?? null;
    if (!photoAttachmentQueue) {
      console.warn("PhotoAttachmentQueue not initialized");
      return null;
    }

    const ext = photo.ext ?? "jpg";
    const ts = Date.now();
    const filename = `${driverId}/${docType}_${ts}.${ext}`;
    const record = await photoAttachmentQueue.savePhoto(photo.base64, filename);
    return record.id;
  };

  const handleSubmit = async () => {
    if (!driverId) {
      Alert.alert("Error", "Driver ID not found");
      return;
    }

    setIsSubmitting(true);

    try {
      // Queue new photos for upload via the attachment queue
      const [licenseId, insuranceId, medicalId] = await Promise.all([
        savePhotoToQueue(licensePhoto, "license"),
        savePhotoToQueue(insurancePhoto, "insurance"),
        savePhotoToQueue(medicalCardPhoto, "medical_card"),
      ]);

      const updateQuery = db
        .updateTable("Drivers")
        .set({
          license_photo_path: licenseId,
          insurance_photo_path: insuranceId,
          medical_card_photo_path: medicalId,
        })
        .where("id", "=", driverId)
        .compile();

      await executeTypedMutation(updateQuery);

      Alert.alert("Success", "Documents updated successfully!", [{ text: "OK", onPress: onClose }]);
    } catch (error) {
      console.error("Error updating documents:", error);
      Alert.alert("Error", "Failed to update documents. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDocumentSection = (
    title: string,
    iconName: string,
    photo: DocumentPhoto,
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => (
    <View style={styles.documentSection}>
      <View style={styles.documentHeader}>
        <View style={styles.documentIconContainer}>
          <Ionicons name={iconName as any} size={24} color="#0A84FF" />
        </View>
        <Text style={styles.documentTitle}>{title}</Text>
      </View>

      {photo.uri ? (
        <View style={styles.photoContainer}>
          <Image source={{ uri: photo.uri }} style={styles.photo} />
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => setter({ uri: null, attachmentId: null })}
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
        <TouchableOpacity style={styles.photoButton} onPress={() => takePhoto(setter)}>
          <Ionicons name="camera" size={16} color="#FFFFFF" />
          <Text style={styles.photoButtonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={() => pickImageFromLibrary(setter)}>
          <Ionicons name="images" size={16} color="#FFFFFF" />
          <Text style={styles.photoButtonText}>Choose Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={() => pickFile(setter)}>
          <Ionicons name="document-attach" size={16} color="#FFFFFF" />
          <Text style={styles.photoButtonText}>Choose File</Text>
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
          {renderDocumentSection("Driver's License", "card", licensePhoto, setLicensePhoto)}

          {renderDocumentSection(
            "Certificate of Insurance",
            "shield-checkmark",
            insurancePhoto,
            setInsurancePhoto
          )}
          
          {showMedCard && renderDocumentSection(
            "Medical Card",
            "medical",
            medicalCardPhoto,
            setMedicalCardPhoto
          )}

          {renderDocumentSection("Medical Card", "medical", medicalCardPhoto, setMedicalCardPhoto)}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function getExtFromUri(uri: string): string | undefined {
  const match = uri.match(/\.(\w+)$/);
  return match?.[1]?.toLowerCase();
}

/**
 * Resolve a local URI for an existing attachment path.
 * The attachment queue stores files at: {documentDirectory}/attachments/{filename}
 */
function getLocalUriForAttachment(attachmentId: string): string | null {
  if (!attachmentId) return null;
  if (!photoAttachmentQueue) return null;

  const localPath = photoAttachmentQueue.getLocalFilePathSuffix(attachmentId);
  return photoAttachmentQueue.getLocalUri(localPath);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  cancelButton: {
    fontSize: 16,
    color: "#0A84FF",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  scrollContent: {
    padding: 16,
  },
  documentSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  documentIconContainer: {
    width: 32,
    height: 32,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  photoContainer: {
    marginBottom: 12,
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  removeButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  removeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyPhotoContainer: {
    height: 200,
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyPhotoText: {
    fontSize: 15,
    color: "#8E8E93",
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  photoButton: {
    flex: 1,
    backgroundColor: "#0A84FF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
  },
  photoButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#34C759",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    backgroundColor: "#A8E6B7",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
