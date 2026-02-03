import { EncodingType } from "@powersync/attachments";
import * as FileSystem from "expo-file-system/legacy";
import { SupabaseStorageAdapter } from "@/library/storage/SupabaseStorageAdapter";

export interface InspectionPhotoAttachmentQueueOptions {
  storage: SupabaseStorageAdapter;
}

/**
 * Lightweight queue for inspection photos.
 *
 * We intentionally do NOT extend AbstractAttachmentQueue or call its init().
 * The driver-documents PhotoAttachmentQueue already owns the single shared
 * `attachments` tracking table; a second queue calling init() on that same
 * table causes OOM and duplicate upload/download attempts.
 *
 * Instead this class:
 *   1. Writes the photo to the local filesystem (so it renders immediately).
 *   2. Uploads it straight to Supabase in the same call.
 *   3. Returns a record whose `id` is the filename — that's what gets stored
 *      in InspectionPhotos.storage_path.
 *
 * On other devices the photo arrives via PowerSync row sync (the
 * storage_path column), and can be fetched on-demand from Supabase if needed.
 */
export class InspectionPhotoAttachmentQueue {
  private storage: SupabaseStorageAdapter;

  constructor(options: InspectionPhotoAttachmentQueueOptions) {
    this.storage = options.storage;
  }

  /** No-op — kept so SystemProvider can call it without branching. */
  async init(): Promise<void> {}

  /**
   * Resolve the local file path suffix for an attachment filename.
   * Matches the convention used by AbstractAttachmentQueue.
   */
  getLocalFilePathSuffix(filename: string): string {
    return `attachments/${filename}`;
  }

  /**
   * Resolve a full local URI from a path suffix.
   */
  getLocalUri(localPath: string): string {
    return `${FileSystem.documentDirectory}${localPath}`;
  }

  /**
   * Save a photo locally AND upload it to Supabase immediately.
   * Returns an object with `id` set to the filename so the caller can
   * store it directly into InspectionPhotos.storage_path.
   */
  async savePhoto(
    base64Data: string,
    filename: string,
  ): Promise<{ id: string }> {
    // 1️⃣  Ensure local directory exists
    const localPath = this.getLocalFilePathSuffix(filename);
    const localUri = this.getLocalUri(localPath);
    const parentDir = localUri.substring(0, localUri.lastIndexOf("/"));
    await this.storage.makeDir(parentDir);

    // 2️⃣  Write to local filesystem so it renders immediately
    await this.storage.writeFile(localUri, base64Data, {
      encoding: EncodingType.Base64,
    });

    // 3️⃣  Upload to Supabase (inspection-photos bucket)
    const arrayBuffer = await this.storage.readFile(localUri, {
      encoding: EncodingType.Base64,
    });
    await this.storage.uploadFile(filename, arrayBuffer, {
      mediaType: "image/jpeg",
    });

    return { id: filename };
  }
}
