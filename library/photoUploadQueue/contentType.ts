/**
 * §3, §10 — Content-Type derived from the file extension.
 *
 * NOT IMPLEMENTED. The placeholder is the current production bug: every file,
 * including PDFs, is uploaded as `image/jpeg`.
 */

/** Fallback when the extension is unknown or absent. */
export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** Extension → MIME map for the formats this app actually uploads. */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

/**
 * Resolves the upload `Content-Type` from a filename, local URI or bucket
 * path. Replaces the `media_type: "image/jpeg"` hardcode in
 * library/powersync/PhotoAttachmentQueue.ts, which sent PDFs with the wrong
 * header (§3, §10).
 */
export function resolveContentType(fileNameOrUri: string): string {
  // Only the basename carries the extension — a dot in a parent segment
  // (e.g. `backup.v2/license`) must not be mistaken for one.
  const basename = fileNameOrUri.split(/[\\/]/).pop() ?? "";
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex < 0) {
    return DEFAULT_CONTENT_TYPE;
  }
  const extension = basename.slice(dotIndex + 1).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? DEFAULT_CONTENT_TYPE;
}
