import { SupabaseStorageAdapter } from "@/library/storage/SupabaseStorageAdapter";
import * as FileSystem from "expo-file-system/legacy";

export interface NvisAttachmentQueueOptions {
  storage: SupabaseStorageAdapter;
}

/**
 * Download-only queue for bleacher NVIS PDFs from the `bleacher-nvis` bucket.
 * Files are cached at: {documentDirectory}/nvis/{nvis_pdf_path}
 */
export class NvisAttachmentQueue {
  private storage: SupabaseStorageAdapter;
  private inFlight = new Map<string, Promise<string>>();

  constructor(options: NvisAttachmentQueueOptions) {
    this.storage = options.storage;
  }

  async init(): Promise<void> {}

  getLocalFilePathSuffix(nvisPdfPath: string): string {
    return `nvis/${nvisPdfPath}`;
  }

  getLocalUri(nvisPdfPath: string): string {
    return `${FileSystem.documentDirectory}${this.getLocalFilePathSuffix(nvisPdfPath)}`;
  }

  async ensureDownloaded(nvisPdfPath: string): Promise<string> {
    const localUri = this.getLocalUri(nvisPdfPath);

    const { exists } = await FileSystem.getInfoAsync(localUri);
    if (exists) return localUri;

    const existing = this.inFlight.get(nvisPdfPath);
    if (existing) return existing;

    const promise = this._download(nvisPdfPath, localUri).finally(() => {
      this.inFlight.delete(nvisPdfPath);
    });

    this.inFlight.set(nvisPdfPath, promise);
    return promise;
  }

  async redownload(nvisPdfPath: string): Promise<string> {
    const localUri = this.getLocalUri(nvisPdfPath);
    const { exists } = await FileSystem.getInfoAsync(localUri);
    if (exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
    return this.ensureDownloaded(nvisPdfPath);
  }

  async isDownloaded(nvisPdfPath: string): Promise<boolean> {
    const localUri = this.getLocalUri(nvisPdfPath);
    const { exists } = await FileSystem.getInfoAsync(localUri);
    return exists;
  }

  private async _download(nvisPdfPath: string, localUri: string): Promise<string> {
    const parentDir = localUri.substring(0, localUri.lastIndexOf("/"));
    await this.storage.makeDir(parentDir);

    const blob = await this.storage.downloadFile(nvisPdfPath);
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
        resolve(result.split(",")[1] ?? result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}