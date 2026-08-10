import { db, photoUploadService } from "@/components/providers/SystemProvider";
import {
  localUriForPath,
  saveToGalleryIfCamera,
  writeLocalPhoto,
  type PhotoSource,
} from "@/library/photoUploadQueue";
import { typeScale } from "@/constants/theme";
import { DocUploadStatusBanner } from "@/features/profile/components/DocUploadStatusBanner";
import { ExpiryDateField } from "@/features/profile/components/ExpiryDateField";
import { useDriverDocUploadStatuses } from "@/features/profile/hooks/useDriverDocUploadStatuses";
import { useFormTheme } from "@/hooks/useTheme";
import { executeTypedMutation } from "@/library/powersync/typedMutation";
import { convertToJpegIfNeeded } from "@/utils/convertToJpeg";
import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
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
  licenseExpiresOn: string | null;
  insuranceExpiresOn: string | null;
  medicalCardExpiresOn: string | null;
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
  /** Capture source — only "camera" is duplicated to the gallery (§4). */
  source?: PhotoSource;
}

export default function EditProfileDocs({
  showMedCard,
  driverId,
  licensePath,
  insurancePath,
  medicalCardPath,
  licenseExpiresOn,
  insuranceExpiresOn,
  medicalCardExpiresOn,
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
  const [licenseExpiry, setLicenseExpiry] = useState<string | null>(
    licenseExpiresOn,
  );
  const [insuranceExpiry, setInsuranceExpiry] = useState<string | null>(
    insuranceExpiresOn,
  );
  const [medicalCardExpiry, setMedicalCardExpiry] = useState<string | null>(
    medicalCardExpiresOn,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const activePaths = [
    licensePhoto.attachmentId ?? licensePath,
    insurancePhoto.attachmentId ?? insurancePath,
    medicalCardPhoto.attachmentId ?? medicalCardPath,
  ];
  const { hasPending, hasFailed, retryFailed, statuses } =
    useDriverDocUploadStatuses(activePaths);

  const { form: theme } = useFormTheme();

  const pickImageFromLibrary = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need camera roll permissions to select photos",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const converted = await convertToJpegIfNeeded(
        asset.uri,
        asset.base64 ?? undefined,
      );
      setter({
        uri: converted.uri,
        base64: converted.base64,
        isNew: true,
        ext: converted.ext,
        source: "library",
      });
    }
  };

  const takePhoto = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need camera permissions to take photos",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const converted = await convertToJpegIfNeeded(
        asset.uri,
        asset.base64 ?? undefined,
      );
      setter({
        uri: converted.uri,
        base64: converted.base64,
        isNew: true,
        ext: converted.ext,
        source: "camera",
      });
    }
  };

  const pickFile = async (
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
  ) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["image/*", "application/pdf"],
    });

    if (!result.canceled && result.assets[0]) {
      const pickedUri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(pickedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const converted = await convertToJpegIfNeeded(pickedUri, base64);
      setter({
        uri: converted.uri,
        base64: converted.base64,
        isNew: true,
        ext: converted.ext,
        source: "file",
      });
    }
  };

  /**
   * Record a document photo for the custom upload queue: write the stable local
   * copy, then upsert the one DriverDocuments row for this (driver, doc_type)
   * with upload_status = pending (design doc §3). Returns the bucket path, which
   * is also mirrored onto Drivers.<doc>_photo_path for existing readers.
   */
  const savePhotoToQueue = async (
    photo: DocumentPhoto,
    docType: string,
  ): Promise<string | null> => {
    if (!photo.isNew || !photo.base64 || !driverId)
      return photo.attachmentId ?? null;

    const ext = photo.ext ?? "jpg";
    const ts = Date.now();
    const filename = `${driverId}/${docType}_${ts}.${ext}`;
    const localUri = await writeLocalPhoto(photo.base64, filename);

    // Camera captures are the only copy until now — duplicate to the gallery
    // as a safety backup (§4). Library/file sources are already persistent.
    void saveToGalleryIfCamera(localUri, photo.source);

    // PowerSync local tables carry no unique index, so upsert manually by
    // finding the existing (driver_uuid, doc_type) row.
    const existing = await db
      .selectFrom("DriverDocuments")
      .select("id")
      .where("driver_uuid", "=", driverId)
      .where("doc_type", "=", docType)
      .limit(1)
      .execute();

    if (existing.length > 0) {
      await executeTypedMutation(
        db
          .updateTable("DriverDocuments")
          .set({
            photo_path: filename,
            local_uri: localUri,
            upload_status: "pending",
            attempts: 0,
            last_attempt_at: null,
            last_error: null,
          })
          .where("id", "=", existing[0].id)
          .compile(),
      );
    } else {
      await executeTypedMutation(
        db
          .insertInto("DriverDocuments")
          .values({
            id: randomUUID(),
            driver_uuid: driverId,
            doc_type: docType,
            photo_path: filename,
            local_uri: localUri,
            upload_status: "pending",
            attempts: 0,
            created_at: new Date().toISOString(),
          })
          .compile(),
      );
    }

    return filename;
  };

  const handleSubmit = async () => {
    if (!driverId) {
      Alert.alert("Error", "Driver ID not found");
      return;
    }

    const missingExpiry: string[] = [];
    if (!licenseExpiry) missingExpiry.push("Driver's License");
    if (!insuranceExpiry) missingExpiry.push("Insurance");
    if (showMedCard && !medicalCardExpiry) missingExpiry.push("Medical Card");

    if (missingExpiry.length > 0) {
      Alert.alert(
        "Expiration dates required",
        `Please set an expiration date for: ${missingExpiry.join(", ")}`,
      );
      return;
    }

    setIsSubmitting(true);

    try {
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
          license_expires_on: licenseExpiry,
          insurance_expires_on: insuranceExpiry,
          medical_card_expires_on: showMedCard ? medicalCardExpiry : null,
        })
        .where("id", "=", driverId)
        .compile();

      await executeTypedMutation(updateQuery);

      // Kick the queue: the user is here and waiting, so retry fast (§6/§7).
      void photoUploadService?.triggerFast();

      Alert.alert(
        "Saved",
        "Documents saved on this device. Upload to the cloud continues in the background — keep the app open until it finishes.",
        [{ text: "OK", onPress: onClose }],
      );
    } catch (error) {
      console.error("Error updating documents:", error);
      Alert.alert("Error", "Failed to update documents. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const { needRepick } = await retryFailed();
      if (needRepick.length > 0) {
        Alert.alert(
          "Re-add required",
          "The local file for some documents is gone. Please choose the photo again and save.",
        );
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const statusLabel = (attachmentId?: string | null) => {
    if (!attachmentId) return null;
    const status = statuses[attachmentId];
    if (status === "pending") return "Uploading…";
    if (status === "failed") return "Upload failed";
    if (status === "uploaded") return "Uploaded";
    return null;
  };

  const renderDocumentSection = (
    title: string,
    iconName: string,
    photo: DocumentPhoto,
    setter: React.Dispatch<React.SetStateAction<DocumentPhoto>>,
    expiry: string | null,
    setExpiry: (date: string | null) => void,
  ) => (
    <View style={[styles.documentSection, { backgroundColor: theme.card }]}>
      <View style={styles.documentHeader}>
        <View style={styles.documentIconContainer}>
          <Ionicons name={iconName as any} size={24} color={theme.accent} />
        </View>
        <Text style={[styles.documentTitle, { color: theme.text }]}>
          {title}
        </Text>
      </View>

      {photo.uri ? (
        <View style={styles.photoContainer}>
          <Image source={{ uri: photo.uri }} style={styles.photo} />
          {statusLabel(photo.attachmentId) ? (
            <Text style={[styles.statusText, { color: theme.textTertiary }]}>
              {statusLabel(photo.attachmentId)}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.removeButton, { backgroundColor: theme.danger }]}
            onPress={() => setter({ uri: null, attachmentId: null })}
          >
            <Text style={[styles.removeButtonText, { color: theme.onAccent }]}>
              Remove
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[
            styles.emptyPhotoContainer,
            { backgroundColor: theme.inputBg, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.emptyPhotoText, { color: theme.textTertiary }]}>
            No photo uploaded
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.photoButton, { backgroundColor: theme.accent }]}
          onPress={() => takePhoto(setter)}
        >
          <Ionicons name="camera" size={16} color={theme.onAccent} />
          <Text style={[styles.photoButtonText, { color: theme.onAccent }]}>
            Take Photo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoButton, { backgroundColor: theme.accent }]}
          onPress={() => pickImageFromLibrary(setter)}
        >
          <Ionicons name="images" size={16} color={theme.onAccent} />
          <Text style={[styles.photoButtonText, { color: theme.onAccent }]}>
            Choose Photo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoButton, { backgroundColor: theme.accent }]}
          onPress={() => pickFile(setter)}
        >
          <Ionicons name="document-attach" size={16} color={theme.onAccent} />
          <Text style={[styles.photoButtonText, { color: theme.onAccent }]}>
            Choose File
          </Text>
        </TouchableOpacity>
      </View>

      <ExpiryDateField value={expiry} onChange={setExpiry} />
    </View>
  );

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: theme.card, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.cancelButton, { color: theme.accent }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Edit Documents
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <DocUploadStatusBanner
            hasPending={hasPending}
            hasFailed={hasFailed}
            isRetrying={isRetrying}
            onRetry={handleRetry}
          />

          {renderDocumentSection(
            "Driver's License",
            "card",
            licensePhoto,
            setLicensePhoto,
            licenseExpiry,
            setLicenseExpiry,
          )}

          {renderDocumentSection(
            "Certificate of Insurance",
            "shield-checkmark",
            insurancePhoto,
            setInsurancePhoto,
            insuranceExpiry,
            setInsuranceExpiry,
          )}

          {showMedCard &&
            renderDocumentSection(
              "Medical Card",
              "medical",
              medicalCardPhoto,
              setMedicalCardPhoto,
              medicalCardExpiry,
              setMedicalCardExpiry,
            )}

          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: theme.secondaryAccent },
              isSubmitting && {
                backgroundColor: theme.secondaryAccent + "66",
              },
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.onSecondaryAccent} />
            ) : (
              <Text
                style={[
                  styles.submitButtonText,
                  { color: theme.onSecondaryAccent },
                ]}
              >
                Save Changes
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function getLocalUriForAttachment(attachmentId: string): string | null {
  if (!attachmentId) return null;
  return localUriForPath(attachmentId);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  cancelButton: {
    ...typeScale.callout,
    fontWeight: "600",
  },
  headerTitle: {
    ...typeScale.title3,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
  },
  documentSection: {
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
    ...typeScale.title3,
    fontWeight: "700",
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
  statusText: {
    ...typeScale.footnote,
    fontWeight: "600",
    marginBottom: 8,
  },
  removeButton: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  removeButtonText: {
    ...typeScale.subhead,
    fontWeight: "600",
  },
  emptyPhotoContainer: {
    height: 200,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyPhotoText: {
    ...typeScale.subhead,
    fontWeight: "400",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  photoButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
  },
  photoButtonText: {
    ...typeScale.caption2,
    fontWeight: "600",
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  submitButtonText: {
    ...typeScale.callout,
    fontWeight: "600",
  },
});
