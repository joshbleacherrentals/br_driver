/**
 * Shared camera / photo-library pickers.
 *
 * One place for the permission prompt, the launch options and the HEIC→JPEG
 * normalisation, so every capture surface (damage report, inspection, document
 * repair) produces the same `PickedPhoto` shape and the same file format. The
 * `source` it carries is what decides gallery duplication downstream (§4) —
 * only camera captures are the app's own, single copy.
 *
 * It is also where the 1080×1920 size cap is applied, for the same reason:
 * every capture surface funnels through here, so the cap cannot be forgotten by
 * a new one (see `downscalePhotoIfNeeded`).
 */

import type { PhotoSource } from "@/library/photoUploadQueue";
import { convertToJpegIfNeeded } from "@/utils/convertToJpeg";
import { downscalePhotoIfNeeded } from "@/utils/downscalePhoto";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

/** A picked file, normalised and ready to be written into the upload queue. */
export type PickedPhoto = {
  /** Temporary picker URI — read it before it is cleaned up. */
  uri: string;
  ext: string;
  source: PhotoSource;
};

/**
 * @param dimensions The picker's own `width`/`height` for the asset. Passed in
 *   rather than measured here so that deciding "is this photo too big?" costs
 *   nothing — measuring would mean decoding the very bitmap we are trying not
 *   to hold. Absent dimensions simply skip the cap.
 */
async function toPickedPhoto(
  uri: string,
  source: PhotoSource,
  dimensions?: { width?: number; height?: number },
): Promise<PickedPhoto> {
  // A downscale re-encodes to JPEG on the way through, so it subsumes the
  // HEIC conversion; only a photo left at its original size still needs one.
  const downscaled = await downscalePhotoIfNeeded(uri, dimensions);
  if (downscaled) {
    return { uri: downscaled.uri, ext: downscaled.ext, source };
  }

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

  const asset = result.assets[0];
  return [await toPickedPhoto(asset.uri, "camera", asset)];
}

/**
 * Multi-select from the photo library. Assets that fail to normalise are
 * skipped rather than failing the whole selection — losing one pick is
 * recoverable, losing the batch is not.
 *
 * @param options.onSelected Called with the number of assets the driver chose,
 *   before any of them is normalised. Normalising a large selection is itself
 *   seconds of work, so this is the earliest moment a caller can put a "working
 *   on 30 photos" indicator on screen — waiting until the batch is returned is
 *   exactly the silence drivers read as a lost selection.
 */
export async function pickPhotosFromLibrary(options?: {
  selectionLimit?: number;
  onSelected?: (count: number) => void;
}): Promise<PickedPhoto[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission needed",
      "Media library permission is required to add photos",
    );
    return [];
  }

  // Deliberately no `quality`: it makes the picker decode and re-encode every
  // selected asset *before* it resolves, so a 25-photo selection pays a full
  // JPEG pass while the driver is still looking at the picker and the app
  // cannot show anything. That pass is also redundant — `toPickedPhoto` below
  // downscales and converts each photo itself, at 0.8, one at a time and with
  // progress reported. Camera capture keeps its `quality`, being a single shot.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: options?.selectionLimit,
  });
  if (result.canceled || !result.assets?.length) return [];

  options?.onSelected?.(result.assets.length);

  const photos: PickedPhoto[] = [];
  for (const asset of result.assets) {
    try {
      photos.push(await toPickedPhoto(asset.uri, "library", asset));
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
