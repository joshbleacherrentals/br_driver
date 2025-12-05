import { Database } from "@/database.types";
import {
  deleteDriverDocument,
  getDriverDocumentUrl,
  uploadDriverDocument,
} from "@/db/documentOperations";
import { SupabaseClient } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import { Upload, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type TypedSupabaseClient = SupabaseClient<Database>;

interface DocumentUploadProps {
  label: string;
  value: string | null;
  onChange: (path: string | null) => void;
  driverId: number;
  supabase: TypedSupabaseClient;
  onUploadComplete?: (path: string) => Promise<void>;
}

function DocumentUpload({
  label,
  value,
  onChange,
  driverId,
  supabase,
  onUploadComplete,
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Load the image URL when value changes
  useEffect(() => {
    if (value) {
      const url = getDriverDocumentUrl(supabase, value);
      setImageUrl(url);
    } else {
      setImageUrl(null);
    }
  }, [value, supabase]);

  const handleFileChange = async () => {
    try {
      if (!driverId) {
        Alert.alert("Error", "Driver ID not found. Please try logging in again.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setUploading(true);

      const file = {
        uri: asset.uri,
        type: asset.mimeType || "image/jpeg",
        name: asset.fileName || `document_${Date.now()}.jpg`,
      };

      console.log("Uploading document for driverId:", driverId);
      const uploadResult = await uploadDriverDocument(supabase, file, driverId);

      if (!uploadResult.success || !uploadResult.path) {
        throw new Error(uploadResult.error || "Upload failed");
      }

      onChange(uploadResult.path);

      // Save to database immediately if callback provided
      if (onUploadComplete) {
        await onUploadComplete(uploadResult.path);
      }

      Alert.alert("Success", "Document uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    Alert.alert("Remove Document", "Are you sure you want to remove this document?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteDriverDocument(supabase, value);

            if (!result.success) {
              throw new Error(result.error || "Delete failed");
            }

            onChange(null);
            Alert.alert("Success", "Document removed");
          } catch (error) {
            console.error("Delete error:", error);
            Alert.alert(
              "Error",
              error instanceof Error ? error.message : "Failed to remove document"
            );
          }
        },
      },
    ]);
  };

  const isPdf = value?.toLowerCase().endsWith(".pdf");

  return (
    <View style={styles.documentContainer}>
      <Text style={styles.documentLabel}>{label}</Text>
      <View style={styles.documentContent}>
        {value ? (
          <>
            <View style={styles.previewContainer}>
              {isPdf ? (
                <View style={styles.pdfPlaceholder}>
                  <Text style={styles.pdfText}>PDF Document</Text>
                </View>
              ) : (
                imageUrl && <Image source={{ uri: imageUrl }} style={styles.previewImage} />
              )}
            </View>
            <TouchableOpacity onPress={handleRemove} style={styles.removeButton}>
              <X size={16} color="#DC2626" />
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            onPress={handleFileChange}
            style={styles.uploadButton}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#64748B" />
            ) : (
              <>
                <Upload size={16} color="#64748B" />
                <Text style={styles.uploadButtonText}>Upload File</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

interface DriverDocumentsProps {
  licensePhotoPath: string | null;
  setLicensePhotoPath: (value: string | null) => void;
  insurancePhotoPath: string | null;
  setInsurancePhotoPath: (value: string | null) => void;
  medicalCardPhotoPath: string | null;
  setMedicalCardPhotoPath: (value: string | null) => void;
  driverId: number;
  supabase: TypedSupabaseClient;
  onDocumentUpdate: (field: string, path: string | null) => Promise<void>;
}

export function DriverDocuments({
  licensePhotoPath,
  setLicensePhotoPath,
  insurancePhotoPath,
  setInsurancePhotoPath,
  medicalCardPhotoPath,
  setMedicalCardPhotoPath,
  driverId,
  supabase,
  onDocumentUpdate,
}: DriverDocumentsProps) {
  return (
    <View style={styles.subsection}>
      <Text style={styles.subsectionTitle}>Documents</Text>
      <DocumentUpload
        label="Driver's License"
        value={licensePhotoPath}
        onChange={setLicensePhotoPath}
        driverId={driverId}
        supabase={supabase}
        onUploadComplete={(path) => onDocumentUpdate("license_photo_path", path)}
      />
      <DocumentUpload
        label="Insurance"
        value={insurancePhotoPath}
        onChange={setInsurancePhotoPath}
        driverId={driverId}
        supabase={supabase}
        onUploadComplete={(path) => onDocumentUpdate("insurance_photo_path", path)}
      />
      <DocumentUpload
        label="Medical Card"
        value={medicalCardPhotoPath}
        onChange={setMedicalCardPhotoPath}
        driverId={driverId}
        supabase={supabase}
        onUploadComplete={(path) => onDocumentUpdate("medical_card_photo_path", path)}
      />
      <Text style={styles.helpText}>Accepted formats: JPG, PNG, PDF (max 10MB)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  subsection: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 12,
  },
  documentContainer: {
    marginBottom: 16,
  },
  documentLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  documentContent: {
    gap: 8,
  },
  previewContainer: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 200,
    resizeMode: "contain",
  },
  pdfPlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  pdfText: {
    fontSize: 14,
    color: "#64748B",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  uploadButtonText: {
    fontSize: 14,
    color: "#64748B",
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  removeButtonText: {
    fontSize: 14,
    color: "#DC2626",
  },
  helpText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
  },
});
