import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export interface ThumbnailOptions {
  maxWidth?: number;
  maxHeight?: number;
  /** 0–1, lower = smaller file. Default 0.5 */
  quality?: number;
  format?: SaveFormat;
}

const DEFAULTS: Required<ThumbnailOptions> = {
  maxWidth: 200,
  maxHeight: 200,
  quality: 0.5,
  format: SaveFormat.JPEG,
};

/**
 * Generate a small base64-encoded thumbnail from a local image URI.
 * Returns the raw base64 string (no data: prefix).
 */
export async function generateThumbnail(
  uri: string,
  opts?: ThumbnailOptions,
): Promise<string> {
  const { maxWidth, maxHeight, quality, format } = { ...DEFAULTS, ...opts };

  const result = await manipulateAsync(
    uri,
    [{ resize: { width: maxWidth, height: maxHeight } }],
    { compress: quality, format, base64: true },
  );

  return result.base64 ?? "";
}
