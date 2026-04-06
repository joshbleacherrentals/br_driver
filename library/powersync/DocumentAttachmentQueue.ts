import { SupabaseStorageAdapter } from "@/library/storage/SupabaseStorageAdapter";
import * as FileSystem from "expo-file-system/legacy";

export interface DocumentAttachmentQueueOptions {
  storage: SupabaseStorageAdapter;
}

/**
 * Download-only queue for BlueBook PDF documents.
 *
 * Like InspectionPhotoAttachmentQueue, this intentionally does NOT extend
 * AbstractAttachmentQueue — we don't want it touching the shared `attachments`
 * tracking table or attempting uploads.
 *
 * Usage:
 *   const localUri = await documentAttachmentQueue.ensureDownloaded("some/path.pdf");
 *   // localUri is a file:// URI ready for expo-file-system / sharing
 */
export class DocumentAttachmentQueue {
  private storage: SupabaseStorageAdapter;
  /** In-flight downloads keyed by document_path — prevents duplicate fetches. */
  private inFlight = new Map<string, Promise<string>>();

  constructor(options: DocumentAttachmentQueueOptions) {
    this.storage = options.storage;
  }

  /** No-op — kept so SystemProvider can call it uniformly. */
  async init(): Promise<void> {}

  /** Local directory suffix for a given document_path. */
  getLocalFilePathSuffix(documentPath: string): string {
    return `bluebook/${documentPath}`;
  }

  /** Full file:// URI for a document_path. */
  getLocalUri(documentPath: string): string {
    return `${FileSystem.documentDirectory}${this.getLocalFilePathSuffix(documentPath)}`;
  }

  /**
   * Returns the local file:// URI for the PDF, downloading it from Supabase
   * if it isn't already cached on disk.
   *
   * Safe to call multiple times concurrently for the same path — in-flight
   * requests are deduplicated.
   */
  async ensureDownloaded(documentPath: string): Promise<string> {
    const localUri = this.getLocalUri(documentPath);

    // Already on disk — return immediately.
    const { exists } = await FileSystem.getInfoAsync(localUri);
    if (exists) return localUri;

    // Deduplicate concurrent requests for the same file.
    const existing = this.inFlight.get(documentPath);
    if (existing) return existing;

    const promise = this._download(documentPath, localUri).finally(() => {
      this.inFlight.delete(documentPath);
    });

    this.inFlight.set(documentPath, promise);
    return promise;
  }

  /**
   * Force a re-download even if the file already exists locally.
   * Useful if the PDF was updated on the server.
   */
  async redownload(documentPath: string): Promise<string> {
    const localUri = this.getLocalUri(documentPath);
    const { exists } = await FileSystem.getInfoAsync(localUri);
    if (exists) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    }
    return this.ensureDownloaded(documentPath);
  }

  /** Whether the PDF is already cached locally. */
  async isDownloaded(documentPath: string): Promise<boolean> {
    const localUri = this.getLocalUri(documentPath);
    const { exists } = await FileSystem.getInfoAsync(localUri);
    return exists;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _download(documentPath: string, localUri: string): Promise<string> {
    // Ensure parent directory exists (e.g. bluebook/some/nested/path/)
    const parentDir = localUri.substring(0, localUri.lastIndexOf("/"));
    await this.storage.makeDir(parentDir);

    // Download blob from Supabase
    const blob = await this.storage.downloadFile(documentPath);

    // Convert blob to base64 and write to disk
    const base64 = await this._blobToBase64(blob);
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return localUri;
  }

  private _blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data:...;base64, prefix
        resolve(result.split(",")[1] ?? result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}