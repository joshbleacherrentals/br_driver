/**
 * §3, §10 — Content-Type derived from the file extension.
 *
 * NOT IMPLEMENTED. The placeholder is the current production bug: every file,
 * including PDFs, is uploaded as `image/jpeg`.
 */

/** Fallback when the extension is unknown or absent. */
export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Resolves the upload `Content-Type` from a filename, local URI or bucket
 * path. Replaces the `media_type: "image/jpeg"` hardcode in
 * library/powersync/PhotoAttachmentQueue.ts, which sent PDFs with the wrong
 * header (§3, §10).
 */
export function resolveContentType(fileNameOrUri: string): string {
  // TODO(photo-queue): implement — placeholder reproduces the jpeg hardcode.
  void fileNameOrUri;
  return "image/jpeg";
}
