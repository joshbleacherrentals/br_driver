/**
 * Shared camera / photo-library pickers.
 *
 * One place for the permission prompt, the launch options and the HEIC→JPEG
 * normalisation, so every capture surface (damage report, inspection, document
 * repair) produces the same `PickedPhoto` shape and the same file format. The
 * `source` it carries is what decides gallery duplication downstream (§4) —
 * only camera captures are the app's own, single copy.
 */

import type { PhotoSource } from "@/library/photoUploadQueue";
import { convertToJpegIfNeeded } from "@/utils/convertToJpeg";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

/** A picked file, normalised and ready to be written into the upload queue. */
export type PickedPhoto = {
  /** Temporary picker URI — read it before it is cleaned up. */
  uri: string;
  ext: string;
  source: PhotoSource;
};

async function toPickedPhoto(
  uri: string,
  source: PhotoSource,
): Promise<PickedPhoto> {
  const converted = await convertToJpegIfNeeded(uri);
  return { uri: converted.uri, ext: converted.ext, source };
}

/** One camera capture. Empty when cancelled or permission was refused. */
export async function pickPhotosFromCamera(): Promise<PickedPhoto[]> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission needed",
      "Camera permission is required to take photos",
    );
    return [];
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.length) return [];

  return [await toPickedPhoto(result.assets[0].uri, "camera")];
}

/**
 * Multi-select from the photo library. Assets that fail to normalise are
 * skipped rather than failing the whole selection — losing one pick is
 * recoverable, losing the batch is not.
 */
export async function pickPhotosFromLibrary(options?: {
  selectionLimit?: number;
}): Promise<PickedPhoto[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission needed",
      "Media library permission is required to add photos",
    );
    return [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: options?.selectionLimit,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return [];

  const photos: PickedPhoto[] = [];
  for (const asset of result.assets) {
    try {
      photos.push(await toPickedPhoto(asset.uri, "library"));
    } catch (err) {
      console.warn("[pickPhotos] could not read picked asset:", err);
    }
  }
  return photos;
}

/**
 * Asks which source to use, then picks. Resolves to an empty list if the driver
 * backs out at either step.
 */
export function promptForPhotos(options?: {
  title?: string;
  message?: string;
  selectionLimit?: number;
}): Promise<PickedPhoto[]> {
  return new Promise((resolve) => {
    Alert.alert(
      options?.title ?? "Add Photos",
      options?.message,
      [
        {
          text: "Take Photo",
          onPress: () => {
            void pickPhotosFromCamera().then(resolve);
          },
        },
        {
          text: "Choose from Library",
          onPress: () => {
            void pickPhotosFromLibrary({
              selectionLimit: options?.selectionLimit,
            }).then(resolve);
          },
        },
        { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
      ],
      { cancelable: true, onDismiss: () => resolve([]) },
    );
  });
}
