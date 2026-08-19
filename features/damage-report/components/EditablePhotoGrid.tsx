import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { DocumentPhoto } from "../types";

import { useThemedStyles } from "@/hooks/useThemedStyles";
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
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

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
            <Ionicons name="camera" size={20} color={theme.onAccent} />
          </View>
          <Text style={styles.photoButtonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={onAddFromLibrary}>
          <View style={styles.iconContainer}>
            <Ionicons name="images" size={20} color={theme.onAccent} />
          </View>
          <Text style={styles.photoButtonText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>

      {/* A plain wrapping `View`, not a `FlatList`: this grid lives inside the
          form's `ScrollView`, and nesting a virtualised list in one is its own
          well-known problem. What made the grid expensive was never the number
          of `<Image>` elements — it was that each one decoded a full-resolution
          capture to fill a 100pt tile. `previewUri` (≈320px, built once at pick
          time) is the fix; `expo-image` adds recycling and downsampling on top,
          and covers the fallback case where no preview could be made. */}
      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((photo, index) => (
            <View
              key={`${photo.uri ?? "photo"}-${index}`}
              style={styles.photoContainer}
            >
              <Image
                source={photo.previewUri ?? photo.uri ?? undefined}
                style={styles.photo}
                contentFit="cover"
                recyclingKey={photo.uri ?? String(index)}
                cachePolicy="memory-disk"
              />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => onRemove(index)}
              >
                <Ionicons name="close" size={16} color={theme.onAccent} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
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
      ...typeScale.title3,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    requiredBadge: {
      flexShrink: 0,
      backgroundColor: theme.danger,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    requiredText: {
      ...typeScale.caption2,
      fontWeight: "700",
      color: theme.onAccent,
      letterSpacing: 0.5,
    },
    photoButtons: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
    },
    photoButton: {
      flex: 1,
      backgroundColor: theme.accent,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: radius.control,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
    },
    photoButtonText: {
      color: theme.onAccent,
      ...typeScale.subhead,
      fontWeight: "600",
    },
    iconContainer: {
      width: 24,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      marginLeft: 8,
    },
    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    photoContainer: { position: "relative", width: 100, height: 100 },
    photo: { width: "100%", height: "100%", borderRadius: radius.control },
    removePhotoButton: {
      position: "absolute",
      top: -8,
      right: -8,
      backgroundColor: theme.danger,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
