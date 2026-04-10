import { StorageAdapter, EncodingType } from "@powersync/attachments";
import { SupabaseClient } from "@supabase/supabase-js";
import { decode as decodeBase64 } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

export interface SupabaseStorageAdapterOptions {
  client: SupabaseClient;
  bucket: string;
}

/**
 * Combined StorageAdapter for @powersync/attachments AbstractAttachmentQueue.
 * Handles both local filesystem and Supabase Storage operations.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(private options: SupabaseStorageAdapterOptions) {}

  async uploadFile(
    filename: string,
    data: ArrayBuffer,
    options?: { mediaType?: string }
  ): Promise<void> {
    const { mediaType = "application/octet-stream" } = options ?? {};

    const { error } = await this.options.client.storage
      .from(this.options.bucket)
      .upload(filename, data, { contentType: mediaType, upsert: true });

    if (error) {
      throw error;
    }
  }

  async downloadFile(filePath: string): Promise<Blob> {
    const { data, error } = await this.options.client.storage
      .from(this.options.bucket)
      .download(filePath);

    if (error) {
      throw error;
    }

    return data as Blob;
  }

  async writeFile(
    fileURI: string,
    base64Data: string,
    options?: { encoding?: EncodingType }
  ): Promise<void> {
    const encoding =
      options?.encoding === EncodingType.Base64
        ? FileSystem.EncodingType.Base64
        : FileSystem.EncodingType.UTF8;
    await FileSystem.writeAsStringAsync(fileURI, base64Data, { encoding });
  }

  async readFile(
    fileURI: string,
    options?: { encoding?: EncodingType; mediaType?: string }
  ): Promise<ArrayBuffer> {
    const { exists } = await FileSystem.getInfoAsync(fileURI);
    if (!exists) {
      throw new Error(`File does not exist: ${fileURI}`);
    }

    const fsEncoding =
      options?.encoding === EncodingType.Base64
        ? FileSystem.EncodingType.Base64
        : FileSystem.EncodingType.UTF8;

    const fileContent = await FileSystem.readAsStringAsync(fileURI, {
      encoding: fsEncoding,
    });

    if (fsEncoding === FileSystem.EncodingType.Base64) {
      return decodeBase64(fileContent);
    }
    const encoder = new TextEncoder();
    return encoder.encode(fileContent).buffer;
  }

  async deleteFile(
    uri: string,
    options?: { filename?: string }
  ): Promise<void> {
    if (await this.fileExists(uri)) {
      await FileSystem.deleteAsync(uri);
    }

    const { filename } = options ?? {};
    if (!filename) return;

    const { error } = await this.options.client.storage
      .from(this.options.bucket)
      .remove([filename]);

    if (error) {
      console.debug("Failed to delete file from Supabase Storage", error);
      throw error;
    }
  }

  async fileExists(fileURI: string): Promise<boolean> {
    const { exists } = await FileSystem.getInfoAsync(fileURI);
    return exists;
  }

  async makeDir(uri: string): Promise<void> {
    const { exists } = await FileSystem.getInfoAsync(uri);
    if (!exists) {
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    }
  }

  async copyFile(sourceUri: string, targetUri: string): Promise<void> {
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  }

  getUserStorageDirectory(): string {
    return FileSystem.documentDirectory!;
  }
}
