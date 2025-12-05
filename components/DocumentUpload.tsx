import { PRIMARY } from "@/constants/AuthStyles";
import {
  deleteDriverDocument,
  getDriverDocumentUrl,
  uploadDriverDocument,
} from "@/db/driverProfile";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface DocumentUploadProps {
  label: string;
  documentType: "license" | "insurance" | "medical_card";
  userId: number;
  value: string | null;
  onChange: (path: string | null) => void;
}

export function DocumentUpload({
  label,
  documentType,
  userId,
  value,
  onChange,
}: DocumentUploadProps) {
  const supabase = useClerkSupabaseClient();
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (value) {
      setImageUrl(getDriverDocumentUrl(supabase, value));
    } else {
      setImageUrl(null);
    }
  }, [value, supabase]);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Photo library access is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        setUploading(true);
        try {
          const storagePath = await uploadDriverDocument(
            supabase,
            userId,
            result.assets[0].uri,
            documentType
          );
          onChange(storagePath);
          Alert.alert("Success", "Document uploaded successfully");
        } catch (error) {
          console.error("Upload error:", error);
          Alert.alert("Upload Failed", error instanceof Error ? error.message : "Unknown error");
        } finally {
          setUploading(false);
        }
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to select photo");
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
            await deleteDriverDocument(supabase, value);
            onChange(null);
            Alert.alert("Success", "Document removed");
          } catch (error) {
            console.error("Delete error:", error);
            Alert.alert("Delete Failed", error instanceof Error ? error.message : "Unknown error");
          }
        },
      },
    ]);
  };

  const isPdf = value?.toLowerCase().endsWith(".pdf");

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.content}>
        {value ? (
          <View style={styles.documentContainer}>
            {isPdf ? (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfText}>PDF Document</Text>
              </View>
            ) : (
              imageUrl && <Image source={{ uri: imageUrl }} style={styles.image} />
            )}
            <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
            onPress={pickImage}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.uploadButtonText}>Uploading...</Text>
              </>
            ) : (
              <Text style={styles.uploadButtonText}>Upload {label}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  content: {
    width: "100%",
  },
  documentContainer: {
    width: "100%",
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
    marginBottom: 8,
  },
  pdfPreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  pdfText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  uploadButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  removeButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  removeButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
