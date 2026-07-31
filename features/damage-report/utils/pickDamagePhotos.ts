import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { DocumentPhoto } from "../types";
import { persistDamagePhoto } from "./persistDamagePhoto";

export async function pickDamagePhotosFromCamera(): Promise<DocumentPhoto[]> {
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

  return [await persistDamagePhoto(result.assets[0].uri)];
}

export async function pickDamagePhotosFromLibrary(): Promise<DocumentPhoto[]> {
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
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return [];

  const photos: DocumentPhoto[] = [];
  for (const asset of result.assets) {
    try {
      photos.push(await persistDamagePhoto(asset.uri));
    } catch (err) {
      console.warn("[pickDamagePhotos] persist failed:", err);
    }
  }
  return photos;
}
