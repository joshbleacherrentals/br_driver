import {
  AbstractAttachmentQueue,
  AttachmentRecord,
  AttachmentState,
  EncodingType,
} from "@powersync/attachments";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Attachment queue for damage-report photos.
 *
 * Storage bucket : damage-report-photos
 * Watched table  : DamageReportPhotos (column: photo_path)
 *
 * Usage (in SystemProvider / wherever queues are initialised):
 *
 *   export const damageReportPhotoAttachmentQueue = new DamageReportPhotoAttachmentQueue(
 *     powerSync,
 *     supabaseStorageAdapter,   // same adapter used by PhotoAttachmentQueue
 *     { syncInterval: 30 },
 *   );
 */
export class DamageReportPhotoAttachmentQueue extends AbstractAttachmentQueue {
  /** Supabase storage bucket name */
  readonly bucketName = "damage-report-photos";

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init() {
    if (!this.options.storage) {
      console.debug(
        "No storage configured, skip DamageReportPhotoAttachmentQueue setup",
      );
      this.options.syncInterval = 0;
      return;
    }
    console.log("[DmgQueue] init()");
    await super.init();
  }

  async expireCache() {
    const res = await this.powersync.getAll<AttachmentRecord>(
      `SELECT * FROM ${this.table}
       WHERE state = ${AttachmentState.SYNCED} OR state = ${AttachmentState.ARCHIVED}
       ORDER BY timestamp DESC
       LIMIT 100 OFFSET ${this.options.cacheLimit}`,
    );

    if (res.length === 0) return;

    this.logger.debug(
      `Expiring ${res.length} damage-photo attachments from local cache only`,
    );
    await this.powersync.writeTransaction(async (tx) => {
      for (const record of res) {
        await tx.execute(`DELETE FROM ${this.table} WHERE id = ?`, [record.id]);
        const localUri = this.getLocalUri(
          record.local_uri || this.getLocalFilePathSuffix(record.filename),
        );
        try {
          if (await this.storage.fileExists(localUri)) {
            await FileSystem.deleteAsync(localUri);
          }
        } catch (e) {
          this.logger.error(e);
        }
      }
    });
  }

  // ── Watch ─────────────────────────────────────────────────────────────────

  /**
   * PowerSync watches this query and calls onUpdate whenever the set of
   * photo_path values changes.  The queue uses the IDs to decide which
   * local files need to be uploaded / downloaded.
   */
  onAttachmentIdsChange(onUpdate: (ids: string[]) => void): void {
    this.powersync.watch(
      `SELECT photo_path AS id
       FROM "DamageReportPhotos"
       WHERE photo_path IS NOT NULL`,
      [],
      {
        onResult: (result) =>
          onUpdate(result.rows?._array.map((r: any) => r.id) ?? []),
      },
    );
  }

  // ── Record factory ────────────────────────────────────────────────────────

  async newAttachmentRecord(
    record?: Partial<AttachmentRecord>,
  ): Promise<AttachmentRecord> {
    const photoId = record?.id ?? randomUUID();
    const hasExtension = /\.\w+$/.test(photoId);
    const filename =
      record?.filename ?? (hasExtension ? photoId : `${photoId}.jpg`);

    return {
      id: photoId,
      filename,
      media_type: "image/jpeg",
      state: AttachmentState.QUEUED_UPLOAD,
      local_uri: this.getLocalFilePathSuffix(filename),
      ...record,
    };
  }

  // ── Upload (override) ─────────────────────────────────────────────────────

  async uploadAttachment(record: AttachmentRecord): Promise<boolean> {
    const shortId = record.id.slice(-30);
    const t0 = Date.now();

    // 1. Check local_uri
    if (!record.local_uri) {
      console.warn(`[DmgQueue] SKIP ${shortId} — no local_uri, archiving`);
      await this.update({ ...record, state: AttachmentState.ARCHIVED });
      return true;
    }

    // 2. Check local file exists
    const localUri = this.getLocalUri(record.local_uri);
    const exists = await this.storage.fileExists(localUri);
    if (!exists) {
      console.warn(`[DmgQueue] SKIP ${shortId} — local file missing, archiving`);
      await this.update({ ...record, state: AttachmentState.ARCHIVED });
      return true;
    }

    // 3. Read local file
    let fileBuffer: ArrayBuffer;
    try {
      fileBuffer = await this.storage.readFile(localUri, {
        encoding: EncodingType.Base64,
        mediaType: record.media_type,
      });
      const readKB = Math.round(fileBuffer.byteLength / 1024);
      console.log(`[DmgQueue] READ OK ${shortId} (${readKB}KB)`);
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      console.error(`[DmgQueue] READ FAILED ${shortId}: ${errStr}`);
      return true;
    }

    // 4. Upload to Supabase Storage
    try {
      console.log(`[DmgQueue] UPLOADING ${shortId} → bucket=${this.bucketName} file=${record.filename}`);
      await this.storage.uploadFile(record.filename, fileBuffer, {
        mediaType: record.media_type,
      });
      const ms = Date.now() - t0;
      console.log(`[DmgQueue] UPLOAD OK ${shortId} in ${ms}ms`);
    } catch (e: any) {
      const ms = Date.now() - t0;
      if (e?.error === "Duplicate" || String(e).includes("Duplicate")) {
        console.log(`[DmgQueue] DUPLICATE ${shortId} — already in storage, marking synced`);
        await this.update({ ...record, state: AttachmentState.SYNCED });
        return true;
      }
      const errStr = e instanceof Error
        ? `${e.name}: ${e.message}`
        : JSON.stringify(e);
      console.error(`[DmgQueue] SUPABASE UPLOAD FAILED ${shortId} after ${ms}ms: ${errStr}`);
      return true;
    }

    // 5. Mark as synced
    await this.update({ ...record, state: AttachmentState.SYNCED });
    console.log(`[DmgQueue] SYNCED ${shortId}`);
    return true;
  }

  // ── Save helpers ────────────────────────────────────────────────────────────

  /**
   * Save base64 image data to the local attachment directory WITHOUT creating
   * an attachment record. Use this when the DamageReportPhotos row will be
   * inserted separately — the base class reconciliation will detect the
   * photo_path, create an attachment record (via newAttachmentRecord which
   * sets local_uri), find the local file, and queue it for upload.
   */
  async savePhotoToDisk(
    base64Data: string,
    filename: string,
  ): Promise<void> {
    const localUriSuffix = this.getLocalFilePathSuffix(filename);
    const localUri = this.getLocalUri(localUriSuffix);
    const parentDir = localUri.substring(0, localUri.lastIndexOf("/"));
    await this.storage.makeDir(parentDir);
    await this.storage.writeFile(localUri, base64Data, {
      encoding: EncodingType.Base64,
    });
  }

  /**
   * Write base64 image data to the local attachment store and queue it for
   * upload to the `damage-report-photos` Supabase bucket.
   */
  async savePhoto(
    base64Data: string,
    filename?: string,
  ): Promise<AttachmentRecord> {
    const photoAttachment = await this.newAttachmentRecord(
      filename ? { id: filename, filename } : undefined,
    );

    const localUri = this.getLocalUri(photoAttachment.local_uri!);
    const parentDir = localUri.substring(0, localUri.lastIndexOf("/"));
    await this.storage.makeDir(parentDir);

    await this.storage.writeFile(localUri, base64Data, {
      encoding: EncodingType.Base64,
    });

    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      photoAttachment.size = (fileInfo as any).size;
    }

    return this.saveToQueue(photoAttachment);
  }
}
