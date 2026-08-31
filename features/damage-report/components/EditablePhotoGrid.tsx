import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { DocumentPhoto } from "../types";
import type { PhotoImportProgress } from "../utils/pickDamagePhotos";
import { PhotoImportProgressRow } from "./PhotoImportProgressRow";
import {
  DAMAGE_REPORT_PHOTO_SUBJECT,
  describePhotoLimit,
  type PhotoLimitSubject,
} from "@/utils/photoLimit";

import { useThemedStyles } from "@/hooks/useThemedStyles";

/**
 * How many tiles mount before the driver asks for more. Tiles are 100pt on a
 * 8pt-gutter wrap grid, so on a phone this is ~8 rows — well past the first
 * screenful, i.e. every ordinary report renders whole and nobody ever sees the
 * "show earlier" control.
 */
const INITIAL_WINDOW = 24;

/** How much the window grows per tap on the "show earlier" tile. */
const WINDOW_STEP = 24;

type Props = {
  photos: DocumentPhoto[];
  title?: string;
  required?: boolean;
  /**
   * Hard cap on how many photos may be attached here. Omitted means uncapped —
   * every capped caller passes `MAX_PHOTOS`, but the grid itself stays a dumb
   * renderer of whatever cap it is handed (including none).
   */
  maxPhotos?: number;
  /**
   * What is holding these photos, so the cap notice can name it — a damage
   * report by default, an inspection question when the inspection widget says
   * so. Ignored while `maxPhotos` is omitted, since there is then no notice.
   */
  limitSubject?: PhotoLimitSubject;
  /**
   * Set while a selection is still being copied off the picker, so the grid can
   * account for the photos that are on their way. Null when nothing is running.
   */
  importing?: PhotoImportProgress | null;
  onAddFromCamera: () => void;
  onAddFromLibrary: () => void;
  onRemove: (index: number) => void;
};

export function EditablePhotoGrid({
  photos,
  title = "Photos",
  required = false,
  maxPhotos,
  limitSubject = DAMAGE_REPORT_PHOTO_SUBJECT,
  importing = null,
  onAddFromCamera,
  onAddFromLibrary,
  onRemove,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // The cap only ever gates *adding*. Removal, the grid and the windowing below
  // are untouched by it, so a report that somehow holds more than the cap still
  // shows every photo and can still be edited down.
  const limit =
    maxPhotos === undefined
      ? null
      : describePhotoLimit(photos.length, maxPhotos, limitSubject);
  // An import in flight blocks adding too: a second picker launched on top of a
  // running import would race its appends, and the count the driver is watching
  // would stop meaning anything.
  const addBlocked = (limit?.atLimit ?? false) || importing !== null;

  // Windowing state. The window is anchored to the *end* of the array so a
  // just-taken photo (always appended) is always on screen; the hidden slice is
  // the older head, reached through the "show earlier" tile.
  const [windowSize, setWindowSize] = React.useState(INITIAL_WINDOW);
  const visibleCount = Math.min(windowSize, photos.length);
  const firstVisibleIndex = photos.length - visibleCount;
  const hiddenCount = firstVisibleIndex;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {title} ({photos.length}
          {limit ? ` of ${limit.max}` : ""})
        </Text>
        {required && (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
        )}
      </View>

      <View style={styles.photoButtons}>
        <TouchableOpacity
          style={[styles.photoButton, addBlocked && styles.photoButtonDisabled]}
          onPress={onAddFromCamera}
          disabled={addBlocked}
          accessibilityRole="button"
          accessibilityState={{ disabled: addBlocked }}
          accessibilityLabel="Take Photo"
        >
          <View style={styles.iconContainer}>
            <Ionicons name="camera" size={20} color={theme.onAccent} />
          </View>
          <Text style={styles.photoButtonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoButton, addBlocked && styles.photoButtonDisabled]}
          onPress={onAddFromLibrary}
          disabled={addBlocked}
          accessibilityRole="button"
          accessibilityState={{ disabled: addBlocked }}
          accessibilityLabel="Choose from Library"
        >
          <View style={styles.iconContainer}>
            <Ionicons name="images" size={20} color={theme.onAccent} />
          </View>
          <Text style={styles.photoButtonText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>

      {importing ? <PhotoImportProgressRow progress={importing} /> : null}

      {/* Informational, not an error: the driver has done nothing wrong, they
          have simply run out of room. Calm accent tokens, no red. */}
      {limit?.notice ? (
        <View style={styles.limitNotice}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={theme.textSecondary}
          />
          <Text style={styles.limitNoticeText}>{limit.notice}</Text>
        </View>
      ) : null}

      {/* Still a plain wrapping `View`, not a `FlatList`: this grid lives inside
          the form's `ScrollView` (see `DamageDetailsForm` and
          `components/widgets/inspection.tsx`), and nesting a virtualised list in
          a same-orientation scroller is its own well-known problem — it either
          traps the scroll behind a fixed height or defeats its own windowing.
          `previewUri` (≈320px, built once at pick time) already stops each tile
          decoding a full-resolution capture, and `expo-image` adds recycling and
          downsampling on top.

          What that does *not* bound is the tile count itself: a 300-photo report
          mounted 300 image views up front. So the grid windows by hand — render
          the trailing `windowSize` photos and offer a tile that reveals the next
          batch. Indices handed to `onRemove` stay absolute, so removal, the
          delete button and the layout are all untouched. */}
      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {hiddenCount > 0 && (
            <TouchableOpacity
              style={styles.showEarlierTile}
              onPress={() => setWindowSize((size) => size + WINDOW_STEP)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${hiddenCount} earlier photos`}
            >
              <Ionicons
                name="chevron-up"
                size={18}
                color={theme.textSecondary}
              />
              <Text style={styles.showEarlierCount}>+{hiddenCount}</Text>
              <Text style={styles.showEarlierLabel}>earlier</Text>
            </TouchableOpacity>
          )}
          {photos.slice(firstVisibleIndex).map((photo, offset) => {
            const index = firstVisibleIndex + offset;
            return (
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
            );
          })}
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
    photoButtonDisabled: {
      opacity: 0.4,
    },
    photoButtonText: {
      color: theme.onAccent,
      ...typeScale.subhead,
      fontWeight: "600",
    },
    limitNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      backgroundColor: theme.accentSoft,
      borderRadius: radius.control,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginTop: -8,
      marginBottom: 16,
    },
    limitNoticeText: {
      flex: 1,
      ...typeScale.footnote,
      color: theme.textSecondary,
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
    showEarlierTile: {
      width: 100,
      height: 100,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    showEarlierCount: {
      ...typeScale.subhead,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    showEarlierLabel: {
      ...typeScale.caption2,
      color: theme.textSecondary,
    },
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
