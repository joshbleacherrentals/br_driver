import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

function guessExtension(uri: string): string {
  const match = uri.match(/\.(jpe?g|png|webp|heic|gif)(\?|$)/i);
  if (!match) return "jpg";
  const ext = match[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

function utiForExtension(ext: string): string {
  switch (ext) {
    case "png":
      return "public.png";
    case "gif":
      return "com.compuserve.gif";
    case "heic":
      return "public.heic";
    default:
      return "public.jpeg";
  }
}

/** Same normalization PowerSync storage uses before FileSystem calls. */
function normalizeFileUri(uri: string): string {
  return uri.replace(/(file:\/\/|https?:\/\/)|\/\/+/g, (match, protocol) =>
    protocol ? protocol : "/",
  );
}

function isRemoteUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const { exists } = await FileSystem.getInfoAsync(uri);
    return exists;
  } catch {
    return false;
  }
}

/**
 * Resolve a shareable local file path.
 * - Remote URL → download to cache
 * - Local path → copy into cache with a proper filename (for Slack etc.)
 * - Missing local file → try fallbackUrl download
 */
async function materializeShareFile(
  uri: string,
  cachePath: string,
  fallbackUrl?: string,
): Promise<string> {
  const normalized = normalizeFileUri(uri);

  if (isRemoteUri(normalized)) {
    const result = await FileSystem.downloadAsync(normalized, cachePath);
    return result.uri;
  }

  const candidates = [
    normalized,
    normalized.startsWith("file://") ? normalized : `file://${normalized}`,
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      await FileSystem.copyAsync({ from: candidate, to: cachePath });
      return cachePath;
    }
  }

  if (fallbackUrl) {
    const result = await FileSystem.downloadAsync(
      normalizeFileUri(fallbackUrl),
      cachePath,
    );
    return result.uri;
  }

  throw new Error("LOCAL_MISSING");
}

/**
 * Opens the system share sheet for an image URI.
 * Works with local files and remote URLs (downloads to cache first).
 * From the sheet the user can Save Image, send to Slack, Messages, etc.
 */
export async function shareImage(
  uri: string,
  options?: {
    filenamePrefix?: string;
    /** Used when the local cache file is missing (synced photo not downloaded yet). */
    fallbackUrl?: string;
  },
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert("Unavailable", "Sharing is not available on this device.");
    return;
  }

  const ext =
    guessExtension(uri) ||
    guessExtension(options?.fallbackUrl ?? "") ||
    "jpg";
  const prefix = options?.filenamePrefix ?? "bleacher-photo";
  const cachePath = `${FileSystem.cacheDirectory}${prefix}-${Date.now()}.${ext}`;

  try {
    const shareUri = await materializeShareFile(
      uri,
      cachePath,
      options?.fallbackUrl,
    );

    await Sharing.shareAsync(shareUri, {
      mimeType: mimeForExtension(ext),
      dialogTitle: "Share photo",
      UTI: utiForExtension(ext),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LOCAL_MISSING") {
      Alert.alert(
        "Photo unavailable",
        "This photo is not available offline yet. Connect to the internet and try again.",
      );
      return;
    }
    throw error;
  }
}

export function supabasePublicObjectUrl(
  bucket: string,
  storagePath: string,
): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}
