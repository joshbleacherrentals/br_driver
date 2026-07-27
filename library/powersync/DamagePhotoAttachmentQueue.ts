import {
  AbstractAttachmentQueue,
  AttachmentRecord,
  AttachmentState,
  EncodingType,
} from "@powersync/attachments";
import { isAlreadyInStorageError } from "@/utils/isAlreadyInStorageError";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Attachment queue for damage-report photos.
 *
 * Storage bucket : damage-report-photos (insert-only, no upsert)
 * Watched table  : DamageReportPhotos (column: photo_path)
 */
export class DamageReportPhotoAttachmentQueue extends AbstractAttachmentQueue {
  /** Supabase storage bucket name */
  readonly bucketName = "damage-report-photos";

  private initialized = false;
  /** Prevents parallel uploads of the same attachment id */
  private inFlightIds = new Set<string>();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init() {
    if (this.initialized) {
      console.log("[DmgQueue] init() skipped — already initialized");
      return;
    }
    if (!this.options.storage) {
      console.debug(
        "No storage configured, skip DamageReportPhotoAttachmentQueue setup",
      );
      this.options.syncInterval = 0;
      return;
    }
    console.log("[DmgQueue] init()");
    await super.init();
    this.initialized = true;
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
   * photo_path values changes. The queue uses the IDs to decide which local
   * files need to be uploaded / downloaded.
   *
   * We only pre-cache (download) the working set of photos so old/resolved
   * reports don't pull hundreds of files onto every device — the rest load
   * lazily from the public bucket URL when a report is opened online:
   *   • the driver's OWN unresolved reports (active work), and
   *   • anything created in the last 2 weeks (recent context).
   * "Own" is derived from the single local Drivers row (Drivers is scoped to
   * this driver by the sync rules), so no user id needs to be injected. Newly
   * captured photos always fall in the 2-week window, so uploads are never
   * dropped.
   */
  onAttachmentIdsChange(onUpdate: (ids: string[]) => void): void {
    this.powersync.watch(
      `SELECT drp.photo_path AS id
       FROM "DamageReportPhotos" drp
       JOIN "DamageReports" dr ON dr.id = drp.damage_report_uuid
       WHERE drp.photo_path IS NOT NULL AND (
         (dr.created_by_user_uuid IN (SELECT user_uuid FROM "Drivers")
           AND dr.resolved_at IS NULL)
         OR dr.created_at >= datetime('now', '-14 days')
       )`,
      [],
      {
        onResult: (result) => {
          const ids = result.rows?._array.map((r: any) => r.id) ?? [];
          console.log(
            `[DmgQueue] onAttachmentIdsChange: ${ids.length} photo_paths (pre-cache set)`,
          );
          onUpdate(ids);
        },
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
    const localUriSuffix = this.getLocalFilePathSuffix(filename);

    // Resolve QUEUED_SYNC: local file exists → upload, otherwise → download.
    // Prevents the download path from marking locally-created photos as SYNCED
    // before the blob reaches Supabase Storage.
    let state = record?.state ?? AttachmentState.QUEUED_UPLOAD;
    if (state === AttachmentState.QUEUED_SYNC) {
      const localUri = this.getLocalUri(localUriSuffix);
      const exists = await this.storage.fileExists(localUri);
      state = exists
        ? AttachmentState.QUEUED_UPLOAD
        : AttachmentState.QUEUED_DOWNLOAD;
    }

    return {
      id: photoId,
      filename,
      media_type: "image/jpeg",
      local_uri: localUriSuffix,
      ...record,
      state,
    };
  }

  // ── Upload (override) ─────────────────────────────────────────────────────

  async uploadAttachment(record: AttachmentRecord): Promise<boolean> {
    const shortId = record.id.slice(-30);
    const t0 = Date.now();

    if (this.inFlightIds.has(record.id)) {
      // Another pass is already uploading this file — stop this loop.
      return false;
    }
    this.inFlightIds.add(record.id);

    try {
      return await this.uploadAttachmentInner(record, shortId, t0);
    } finally {
      this.inFlightIds.delete(record.id);
    }
  }

  private async uploadAttachmentInner(
    record: AttachmentRecord,
    shortId: string,
    t0: number,
  ): Promise<boolean> {
    // 1. Check local_uri
    if (!record.local_uri) {
      console.warn(`[DmgQueue] SKIP ${shortId} — no local_uri, marking failed`);
      await this.update({ ...record, state: AttachmentState.ARCHIVED });
      await this.markPhotoStatus(record.filename, "failed");
      return true; // move on to next photo
    }

    // 2. Check local file exists
    const localUri = this.getLocalUri(record.local_uri);
    const exists = await this.storage.fileExists(localUri);
    if (!exists) {
      console.warn(
        `[DmgQueue] SKIP ${shortId} — local file missing, marking failed`,
      );
      await this.update({ ...record, state: AttachmentState.ARCHIVED });
      await this.markPhotoStatus(record.filename, "failed");
      return true; // move on — user must retry / re-add
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
      // Temporary — stop this pass; retry on next syncInterval
      return false;
    }

    // 4. Upload to Supabase Storage (insert-only, no upsert)
    try {
      console.log(
        `[DmgQueue] UPLOADING ${shortId} → bucket=${this.bucketName} file=${record.filename}`,
      );
      await this.storage.uploadFile(record.filename, fileBuffer, {
        mediaType: record.media_type,
      });
      const ms = Date.now() - t0;
      console.log(`[DmgQueue] UPLOAD OK ${shortId} in ${ms}ms`);
    } catch (e: any) {
      const ms = Date.now() - t0;
      if (isAlreadyInStorageError(e)) {
        console.log(
          `[DmgQueue] ALREADY EXISTS ${shortId} — marking synced`,
        );
        await this.update({ ...record, state: AttachmentState.SYNCED });
        await this.markPhotoStatus(record.filename, "uploaded");
        return true;
      }
      const errStr =
        e instanceof Error
          ? `${e.name}: ${e.message}`
          : JSON.stringify(e);
      console.error(
        `[DmgQueue] SUPABASE UPLOAD FAILED ${shortId} after ${ms}ms: ${errStr}`,
      );
      // Stop the tight loop; syncInterval / next trigger will retry
      return false;
    }

    // 5. Mark as synced in attachment table
    await this.update({ ...record, state: AttachmentState.SYNCED });
    console.log(`[DmgQueue] SYNCED ${shortId}`);

    // 6. Permanently mark photo as uploaded in DamageReportPhotos
    await this.markPhotoStatus(record.filename, "uploaded");

    return true;
  }

  private async markPhotoStatus(
    photoPath: string,
    status: "pending" | "uploaded" | "failed",
  ): Promise<void> {
    try {
      await this.powersync.execute(
        `UPDATE "DamageReportPhotos" SET upload_status = ? WHERE photo_path = ?`,
        [status, photoPath],
      );
    } catch (e) {
      console.warn(
        `[DmgQueue] Failed to mark upload_status=${status} for ${photoPath}: ${e}`,
      );
    }
  }

  /** Whether the local cache file for this photo_path still exists. */
  async hasLocalFile(photoPath: string): Promise<boolean> {
    const localUriSuffix = this.getLocalFilePathSuffix(photoPath);
    const localUri = this.getLocalUri(localUriSuffix);
    return this.storage.fileExists(localUri);
  }

  /**
   * Re-queue a photo for upload after a failure.
   * Returns false if the local file is gone (caller should ask user to re-add).
   */
  async retryUpload(photoPath: string): Promise<boolean> {
    const localUriSuffix = this.getLocalFilePathSuffix(photoPath);
    const localUri = this.getLocalUri(localUriSuffix);
    const exists = await this.storage.fileExists(localUri);
    if (!exists) {
      console.warn(`[DmgQueue] retryUpload: no local file for ${photoPath}`);
      return false;
    }

    await this.markPhotoStatus(photoPath, "pending");

    const existing = await this.record(photoPath);
    if (existing) {
      await this.update({
        ...existing,
        local_uri: existing.local_uri ?? localUriSuffix,
        state: AttachmentState.QUEUED_UPLOAD,
      });
    } else {
      const record = await this.newAttachmentRecord({
        id: photoPath,
        filename: photoPath,
        state: AttachmentState.QUEUED_UPLOAD,
      });
      await this.saveToQueue(record);
    }

    this.trigger();
    return true;
  }

  /**
   * Replace a missing local photo and re-queue upload at the same photo_path.
   */
  async replaceAndRetry(photoPath: string, base64Data: string): Promise<void> {
    await this.savePhotoToDisk(base64Data, photoPath);
    await this.markPhotoStatus(photoPath, "pending");

    const existing = await this.record(photoPath);
    if (existing) {
      await this.update({
        ...existing,
        local_uri: this.getLocalFilePathSuffix(photoPath),
        state: AttachmentState.QUEUED_UPLOAD,
      });
    } else {
      await this.saveToQueue(
        await this.newAttachmentRecord({
          id: photoPath,
          filename: photoPath,
          state: AttachmentState.QUEUED_UPLOAD,
        }),
      );
    }

    this.trigger();
  }

  // ── Save helpers ────────────────────────────────────────────────────────────

  /**
   * Save base64 image data to the local attachment directory WITHOUT creating
   * an attachment record. Use this when the DamageReportPhotos row will be
   * inserted separately — the base class reconciliation will detect the
   * photo_path, create an attachment record (via newAttachmentRecord which
   * sets local_uri), find the local file, and queue it for upload.
   */
  async savePhotoToDisk(base64Data: string, filename: string): Promise<void> {
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
