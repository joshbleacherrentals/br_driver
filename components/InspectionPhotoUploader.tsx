import { PRIMARY } from "@/constants/AuthStyles";
import { currentDriver$ } from "@/state/stores/drivers.store";
import { inspectionPhotos$ } from "@/state/stores/inspectionPhotos.store";
import { inspectionPhotoUploadQueue$ } from "@/state/stores/inspectionPhotoUploadQueue.store";
import { supabase } from "@/utils/supabase/supabaseClient";
import { generateId } from "@/utils/supabase/supaLegend/util";
import { useSelector } from "@legendapp/state/react";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

function getPhotoPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from("inspection-photos").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function copyToAppStorage(photoUuid: string, originalUri: string, ext = "jpg") {
  const dir = new Directory(Paths.document, "inspection-photos");
  dir.create({ intermediates: true, idempotent: true });

  const localFile = new File(dir, `${photoUuid}.${ext}`);

  // originalUri from ImagePicker is usually a file:// URI -> can be wrapped in File
  const src = new File(originalUri);
  src.copy(localFile);

  return localFile.uri; // file://...
}

export default function InspectionPhotoUploader({
  inspectionUuid,
}: {
  inspectionUuid: string | null;
}) {
  const driverId = currentDriver$.driver_id.get();

  const photosForThisInspection = useSelector(() => {
    if (!inspectionUuid) return [];
    const all = inspectionPhotos$.get() || {};
    return Object.values(all)
      .filter((p: any) => p && !p.deleted && p.inspection_uuid === inspectionUuid)
      .sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""));
  });

  const pickImage = async (source: "camera" | "gallery") => {
    if (!inspectionUuid) {
      Alert.alert(
        "Create Inspection First",
        "Submit the inspection (or generate its UUID on open) before adding photos."
      );
      return;
    }
    if (!driverId) {
      Alert.alert("Error", "Missing driver.");
      return;
    }

    let result: ImagePicker.ImagePickerResult;

    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted")
        return Alert.alert("Permission Denied", "Camera access is required.");
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.1,
        exif: false,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted")
        return Alert.alert("Permission Denied", "Photo library access is required.");
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.1,
        exif: false,
      });
    }

    if (result.canceled || !result.assets?.length) return;

    for (const asset of result.assets) {
      const originalUri = asset.uri;
      const photoUuid = generateId();

      // 1) Copy into persistent local folder so it survives app restarts
      const localPath = await copyToAppStorage(photoUuid, originalUri);

      // 2) Create DB row locally (Legend will sync later)
      inspectionPhotos$[photoUuid].assign({
        inspection_photo_uuid: photoUuid,
        inspection_uuid: inspectionUuid,
        storage_path: "",
        upload_status: "pending",
        last_error: null,
        deleted: false,
      });

      // 3) Enqueue upload (persisted queue)
      inspectionPhotoUploadQueue$[photoUuid].assign({
        inspection_photo_uuid: photoUuid,
        inspection_uuid: inspectionUuid,
        local_path: localPath,
        mime: "image/jpeg",
        attempts: 0,
        status: "queued",
      });
    }
  };

  const showImageSourceOptions = () => {
    Alert.alert("Add Photo", "Choose a source", [
      { text: "Take Photo", onPress: () => pickImage("camera") },
      { text: "Choose from Gallery", onPress: () => pickImage("gallery") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderUriForPhoto = (p: any) => {
    if (p.upload_status !== "uploaded") {
      const q = inspectionPhotoUploadQueue$[p.inspection_photo_uuid].get();
      return q?.local_path ?? null;
    }
    if (!p.storage_path) return null;
    return getPhotoPublicUrl(p.storage_path);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inspection Photos</Text>
        <TouchableOpacity style={styles.addButton} onPress={showImageSourceOptions}>
          <Text style={styles.addButtonText}>+ Add Photo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosContainer}>
        {photosForThisInspection.map((p: any) => {
          const uri = renderUriForPhoto(p);
          if (!uri) return null;

          return (
            <View key={p.inspection_photo_uuid} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photo} />
              {p.upload_status !== "uploaded" && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{p.upload_status}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {photosForThisInspection.length === 0 && (
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
