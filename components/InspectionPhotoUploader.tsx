import { PRIMARY } from "@/constants/AuthStyles";
import {
  deleteInspectionPhoto,
  getPhotoPublicUrl,
  uploadInspectionPhoto,
} from "@/db/inspectionPhotos";
import { InspectionPhoto } from "@/types/inspectionPhoto";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface InspectionPhotoUploaderProps {
  inspectionId: number | null; // null before inspection is created
  existingPhotos?: InspectionPhoto[];
  onPhotosChange?: (photos: InspectionPhoto[]) => void;
  onPendingPhotosChange?: (pendingUris: string[]) => void;
}

export default function InspectionPhotoUploader({
  inspectionId,
  existingPhotos = [],
  onPhotosChange,
  onPendingPhotosChange,
}: InspectionPhotoUploaderProps) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState<InspectionPhoto[]>(existingPhotos);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]); // Local URIs before inspection is created

  // Notify parent of pending photos changes
  React.useEffect(() => {
    onPendingPhotosChange?.(pendingPhotos);
  }, [pendingPhotos]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (fileUri: string) => {
      if (!inspectionId) {
        throw new Error("Inspection must be created before uploading photos");
      }
      return await uploadInspectionPhoto(supabase, inspectionId, fileUri);
    },
    onSuccess: (newPhoto) => {
      console.log("Photo uploaded successfully:", newPhoto);
      const updatedPhotos = [...photos, newPhoto];
      setPhotos(updatedPhotos);
      onPhotosChange?.(updatedPhotos);
      queryClient.invalidateQueries({ queryKey: ["inspectionPhotos", inspectionId] });
    },
    onError: (error) => {
      console.error("Photo upload error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      Alert.alert("Upload Failed", `Failed to upload photo: ${error.message || "Unknown error"}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (photo: InspectionPhoto) => {
      await deleteInspectionPhoto(supabase, photo.photo_id, photo.storage_path);
    },
    onSuccess: (_, deletedPhoto) => {
      const updatedPhotos = photos.filter((p) => p.photo_id !== deletedPhoto.photo_id);
      setPhotos(updatedPhotos);
      onPhotosChange?.(updatedPhotos);
      queryClient.invalidateQueries({ queryKey: ["inspectionPhotos", inspectionId] });
    },
    onError: (error) => {
      console.error("Photo delete error:", error);
      Alert.alert("Delete Failed", "Failed to delete photo. Please try again.");
    },
  });

  // Request permissions and pick image
  const pickImage = async (source: "camera" | "gallery") => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Denied", "Camera access is required to take photos.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.1,
          exif: false,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Denied", "Photo library access is required.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          allowsMultipleSelection: true,
          quality: 0.1,
          exif: false,
        });
      }

      if (!result.canceled && result.assets.length > 0) {
        const selectedUris = result.assets.map((asset) => asset.uri);
        console.log(`${selectedUris.length} photo(s) selected:`, selectedUris);
        console.log("Inspection ID:", inspectionId);

        if (inspectionId) {
          // Upload immediately if inspection exists
          console.log("Uploading photos immediately...");
          selectedUris.forEach((uri) => uploadMutation.mutate(uri));
        } else {
          // Store locally if inspection doesn't exist yet
          console.log("Storing photos as pending...");
          const newPendingPhotos = [...pendingPhotos, ...selectedUris];
          setPendingPhotos(newPendingPhotos);
        }
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to select photo. Please try again.");
    }
  };

  const showImageSourceOptions = () => {
    Alert.alert("Add Photo", "Choose a source", [
      { text: "Take Photo", onPress: () => pickImage("camera") },
      { text: "Choose from Gallery", onPress: () => pickImage("gallery") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleDeletePhoto = (photo: InspectionPhoto) => {
    Alert.alert("Delete Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(photo) },
    ]);
  };

  const handleDeletePendingPhoto = (uri: string) => {
    setPendingPhotos(pendingPhotos.filter((p) => p !== uri));
  };

  // Allow uploading pending photos once inspection is created
  const uploadPendingPhotos = async () => {
    if (!inspectionId || pendingPhotos.length === 0) return;

    for (const uri of pendingPhotos) {
      uploadMutation.mutate(uri);
    }
    setPendingPhotos([]);
  };

  // Auto-upload pending photos when inspectionId becomes available
  React.useEffect(() => {
    if (inspectionId && pendingPhotos.length > 0) {
      uploadPendingPhotos();
    }
  }, [inspectionId]);

  const isUploading = uploadMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inspection Photos</Text>
        <TouchableOpacity
          style={[styles.addButton, isUploading && styles.addButtonDisabled]}
          onPress={showImageSourceOptions}
          disabled={isUploading}
        >
          <Text style={styles.addButtonText}>+ Add Photo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosContainer}>
        {/* Pending photos (not yet uploaded) */}
        {pendingPhotos.map((uri, index) => (
          <View key={`pending-${index}`} style={styles.photoWrapper}>
            <Image source={{ uri }} style={styles.photo} />
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeletePendingPhoto(uri)}
            >
              <Text style={styles.deleteButtonText}>×</Text>
            </TouchableOpacity>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>Pending</Text>
            </View>
          </View>
        ))}

        {/* Uploaded photos */}
        {photos.map((photo) => (
          <View key={photo.photo_id} style={styles.photoWrapper}>
            <Image
              source={{ uri: getPhotoPublicUrl(supabase, photo.storage_path) }}
              style={styles.photo}
            />
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeletePhoto(photo)}
              disabled={isDeleting}
            >
              <Text style={styles.deleteButtonText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Loading indicator */}
        {isUploading && (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>Uploading...</Text>
          </View>
        )}
      </ScrollView>

      {photos.length === 0 && pendingPhotos.length === 0 && !isUploading && (
        <Text style={styles.emptyText}>No photos added yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: PRIMARY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  warningText: {
    fontSize: 13,
    color: "#F59E0B",
    marginBottom: 12,
    fontStyle: "italic",
  },
  photosContainer: {
    flexDirection: "row",
  },
  photoWrapper: {
    position: "relative",
    marginRight: 12,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  deleteButton: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
  },
  pendingBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(251, 191, 36, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pendingBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  loadingWrapper: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748B",
  },
  emptyText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    paddingVertical: 24,
    fontStyle: "italic",
  },
});
