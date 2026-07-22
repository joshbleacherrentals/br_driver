import {
  AbstractAttachmentQueue,
  AttachmentRecord,
  AttachmentState,
  EncodingType,
} from "@powersync/attachments";
import { isAlreadyInStorageError } from "@/utils/isAlreadyInStorageError";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { DRIVERS_TABLE } from "./AppSchema";

/**
 * Attachment queue for driver documents (license, insurance, medical card).
 *
 * Storage bucket : driver-documents (upsert allowed)
 * Watched columns: Drivers.license_photo_path / insurance_photo_path /
 *                  medical_card_photo_path
 */
export class PhotoAttachmentQueue extends AbstractAttachmentQueue {
  readonly bucketName = "driver-documents";

  private initialized = false;
  /** Prevents parallel uploads of the same attachment id */
  private inFlightIds = new Set<string>();

  async init() {
    if (this.initialized) {
      console.debug("[PhotoQueue] init() skipped — already initialized");
      return;
    }
    if (!this.options.storage) {
      console.debug(
        "No storage configured, skip setting up PhotoAttachmentQueue",
      );
      this.options.syncInterval = 0;
      return;
    }

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
      `Expiring ${res.length} driver-doc attachments from local cache only`,
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

  onAttachmentIdsChange(onUpdate: (ids: string[]) => void): void {
    this.powersync.watch(
      `SELECT license_photo_path as id FROM ${DRIVERS_TABLE} WHERE license_photo_path IS NOT NULL
       UNION
       SELECT insurance_photo_path as id FROM ${DRIVERS_TABLE} WHERE insurance_photo_path IS NOT NULL
       UNION
       SELECT medical_card_photo_path as id FROM ${DRIVERS_TABLE} WHERE medical_card_photo_path IS NOT NULL`,
      [],
      {
        onResult: (result) =>
          onUpdate(result.rows?._array.map((r: any) => r.id) ?? []),
      },
    );
  }

  async newAttachmentRecord(
    record?: Partial<AttachmentRecord>,
  ): Promise<AttachmentRecord> {
    const photoId = record?.id ?? randomUUID();
    // If the ID already looks like a path with an extension (e.g. "driverId/license.jpg"),
    // use it directly as the filename to avoid double extensions.
    const hasExtension = /\.\w+$/.test(photoId);
    const filename =
      record?.filename ?? (hasExtension ? photoId : `${photoId}.jpg`);
    const localUriSuffix = this.getLocalFilePathSuffix(filename);

    // Resolve QUEUED_SYNC: local file exists → upload, otherwise → download.
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

  async uploadAttachment(record: AttachmentRecord): Promise<boolean> {
    const shortId = record.id.slice(-40);
    const t0 = Date.now();

    if (this.inFlightIds.has(record.id)) {
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
    if (!record.local_uri) {
      console.warn(`[PhotoQueue] SKIP ${shortId} — no local_uri, archiving`);
      await this.update({ ...record, state: AttachmentState.ARCHIVED });
      return true;
    }

    const localUri = this.getLocalUri(record.local_uri);
    const exists = await this.storage.fileExists(localUri);
    if (!exists) {
      console.warn(
        `[PhotoQueue] SKIP ${shortId} — local file missing, archiving`,
      );
      await this.update({ ...record, state: AttachmentState.ARCHIVED });
      return true;
    }

    let fileBuffer: ArrayBuffer;
    try {
      fileBuffer = await this.storage.readFile(localUri, {
        encoding: EncodingType.Base64,
        mediaType: record.media_type,
      });
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      console.error(`[PhotoQueue] READ FAILED ${shortId}: ${errStr}`);
      return false;
    }

    try {
      console.log(
        `[PhotoQueue] UPLOADING ${shortId} → bucket=${this.bucketName} file=${record.filename}`,
      );
      await this.storage.uploadFile(record.filename, fileBuffer, {
        mediaType: record.media_type,
      });
      console.log(
        `[PhotoQueue] UPLOAD OK ${shortId} in ${Date.now() - t0}ms`,
      );
    } catch (e: unknown) {
      const ms = Date.now() - t0;
      if (isAlreadyInStorageError(e)) {
        console.log(`[PhotoQueue] ALREADY EXISTS ${shortId} — marking synced`);
        await this.update({ ...record, state: AttachmentState.SYNCED });
        return true;
      }
      const errStr =
        e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
      console.error(
        `[PhotoQueue] SUPABASE UPLOAD FAILED ${shortId} after ${ms}ms: ${errStr}`,
      );
      // Stop the tight loop; syncInterval / next trigger will retry
      return false;
    }

    await this.update({ ...record, state: AttachmentState.SYNCED });
    return true;
  }

  /** Whether the local cache file for this storage path still exists. */
  async hasLocalFile(photoPath: string): Promise<boolean> {
    const localUriSuffix = this.getLocalFilePathSuffix(photoPath);
    const localUri = this.getLocalUri(localUriSuffix);
    return this.storage.fileExists(localUri);
  }

  /**
   * Re-queue a document for upload after a failure.
   * Returns false if the local file is gone (caller should ask user to re-add).
   */
  async retryUpload(photoPath: string): Promise<boolean> {
    const localUriSuffix = this.getLocalFilePathSuffix(photoPath);
    const localUri = this.getLocalUri(localUriSuffix);
    const exists = await this.storage.fileExists(localUri);
    if (!exists) {
      console.warn(`[PhotoQueue] retryUpload: no local file for ${photoPath}`);
      return false;
    }

    const existing = await this.record(photoPath);
    if (existing) {
      await this.update({
        ...existing,
        local_uri: existing.local_uri ?? localUriSuffix,
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
    return true;
  }

  /**
   * Replace a missing local document and re-queue upload at the same path.
   */
  async replaceAndRetry(photoPath: string, base64Data: string): Promise<void> {
    await this.savePhoto(base64Data, photoPath);
    this.trigger();
  }

  async savePhoto(
    base64Data: string,
    filename?: string,
  ): Promise<AttachmentRecord> {
    // Use the filename as the ID so the Drivers table stores the same value
    // that the watcher returns and that Supabase uses as the storage path.
    const photoAttachment = await this.newAttachmentRecord(
      filename ? { id: filename, filename } : undefined,
    );
    const localUri = this.getLocalUri(photoAttachment.local_uri!);

    // Ensure the parent directory exists (e.g. attachments/{driverId}/)
    const parentDir = localUri.substring(0, localUri.lastIndexOf("/"));
    await this.storage.makeDir(parentDir);

    await this.storage.writeFile(localUri, base64Data, {
      encoding: EncodingType.Base64,
    });

    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      photoAttachment.size = fileInfo.size;
    }

    return this.saveToQueue(photoAttachment);
  }
}
