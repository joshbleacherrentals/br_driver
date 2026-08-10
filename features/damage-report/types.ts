import type { PhotoSource } from "@/library/photoUploadQueue";

/** Local picker photo — never keep full-image base64 in React state. */
export type DocumentPhoto = {
  uri: string | null;
  attachmentId?: string | null;
  isNew?: boolean;
  ext?: string;
  /** Capture source — only "camera" is duplicated to the gallery (§4). */
  source?: PhotoSource;
};
