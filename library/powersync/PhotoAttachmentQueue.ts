import {
  AbstractAttachmentQueue,
  AttachmentRecord,
  AttachmentState,
  EncodingType,
} from "@powersync/attachments";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { DRIVERS_TABLE } from "./AppSchema";

export class PhotoAttachmentQueue extends AbstractAttachmentQueue {
  private initialized = false;

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

    // Clean up stale/corrupt attachment records (e.g. double extensions from earlier bugs)
    // await this.cleanupStaleRecords();
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
    return {
      id: photoId,
      filename,
      media_type: "image/jpeg",
      state: AttachmentState.QUEUED_UPLOAD,
      ...record,
    };
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
    photoAttachment.local_uri = this.getLocalFilePathSuffix(
      photoAttachment.filename,
    );
    const localUri = this.getLocalUri(photoAttachment.local_uri);

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
