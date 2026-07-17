import { ACCENT_BLUE, DANGER_RED } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { DocumentPhoto } from "../types";

type Props = {
  photos: DocumentPhoto[];
  title?: string;
  required?: boolean;
  onAddFromCamera: () => void;
  onAddFromLibrary: () => void;
  onRemove: (index: number) => void;
};

export function EditablePhotoGrid({
  photos,
  title = "Photos",
  required = false,
  onAddFromCamera,
  onAddFromLibrary,
  onRemove,
}: Props) {
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {title} ({photos.length})
        </Text>
        {required && (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
        )}
      </View>

      <View style={styles.photoButtons}>
        <TouchableOpacity style={styles.photoButton} onPress={onAddFromCamera}>
          <View style={styles.iconContainer}>
            <Ionicons name="camera" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.photoButtonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.photoButton}
          onPress={onAddFromLibrary}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="images" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.photoButtonText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>

      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((photo, index) => (
            <View key={`${photo.uri ?? "photo"}-${index}`} style={styles.photoContainer}>
              <Image
                source={{ uri: photo.uri ?? undefined }}
                style={styles.photo}
              />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => onRemove(index)}
              >
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  requiredBadge: {
    flexShrink: 0,
    backgroundColor: DANGER_RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  photoButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  photoButton: {
    flex: 1,
    backgroundColor: ACCENT_BLUE,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  photoButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  iconContainer: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginLeft: 8,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoContainer: { position: "relative", width: 100, height: 100 },
  photo: { width: "100%", height: "100%", borderRadius: 8 },
  removePhotoButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: DANGER_RED,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
