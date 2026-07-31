import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

function getExtension(uri: string): string | undefined {
  return uri.match(/\.(\w+)$/)?.[1]?.toLowerCase();
}

export async function convertToJpegIfNeeded(
  uri: string,
  base64?: string,
): Promise<{ uri: string; base64?: string; ext: string }> {
  const ext = getExtension(uri);

  if (!ext || !HEIC_EXTENSIONS.has(ext)) {
    return { uri, base64, ext: ext ?? "jpg" };
  }

  // Only allocate HEIC→JPEG base64 when the caller already asked for base64.
  const result = await manipulateAsync(uri, [], {
    compress: 0.8,
    format: SaveFormat.JPEG,
    base64: base64 !== undefined,
  });

  return {
    uri: result.uri,
    base64: result.base64 ?? base64,
    ext: "jpg",
  };
}
