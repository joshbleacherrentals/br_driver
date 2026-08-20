import type { PhotoSource } from "@/library/photoUploadQueue";

/** Local picker photo — never keep full-image base64 in React state. */
export type DocumentPhoto = {
  uri: string | null;
  /**
   * Small on-disk preview of {@link uri}, for grid tiles. `null`/absent means
   * none could be made, and the grid falls back to the full-resolution file.
   * A URI, never image data: state holds paths, the OS holds pixels.
   */
  previewUri?: string | null;
  attachmentId?: string | null;
  isNew?: boolean;
  ext?: string;
  /** Capture source — only "camera" is duplicated to the gallery (§4). */
  source?: PhotoSource;
};
