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
    // If the caller already passed a path with an extension (e.g.
    // "damageReportId/questionId/photo_0_1234567890.jpg") use it directly
    // as the filename so we never produce double-extension filenames.
    const hasExtension = /\.\w+$/.test(photoId);
    const filename =
      record?.filename ?? (hasExtension ? photoId : `${photoId}.jpg`);

    return {
      id: photoId,
      filename,
      media_type: "image/jpeg",
      state: AttachmentState.QUEUED_UPLOAD,
      ...record,
    };
  }

  // ── Save helper ───────────────────────────────────────────────────────────

  /**
   * Write base64 image data to the local attachment store and queue it for
   * upload to the `damage-report-photos` Supabase bucket.
   *
   * @param base64Data  Raw base64 string (no data-URI prefix).
   * @param filename    Storage path, e.g. `"<reportId>/<questionId>/photo_0_<ts>.jpg"`.
   *                    When omitted a random UUID filename is generated.
   * @returns           The queued AttachmentRecord whose `.id` is the storage path
   *                    (same value you should persist in DamageReportPhotos.photo_path).
   */
  async savePhoto(
    base64Data: string,
    filename?: string,
  ): Promise<AttachmentRecord> {
    const photoAttachment = await this.newAttachmentRecord(
      filename ? { id: filename, filename } : undefined,
    );

    photoAttachment.local_uri = this.getLocalFilePathSuffix(
      photoAttachment.filename,
    );
    const localUri = this.getLocalUri(photoAttachment.local_uri);

    // Make sure the parent directory exists
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
