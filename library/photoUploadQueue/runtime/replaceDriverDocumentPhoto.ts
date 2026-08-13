/**
 * Single-photo replace for a driver document.
 *
 * `DriverDocuments` holds exactly one row per (driver, doc_type), so there is
 * nothing to reconcile — no multi-select, no surplus, no deletions. The row is
 * reused in place and only its file changes.
 *
 * Unlike the report/inspection repair this *does* mint a fresh `photo_path`,
 * mirroring what a normal document save already does. It is safe here (the only
 * other reference is `Drivers.<doc>_photo_path`, updated in the same commit) and
 * it is necessary: a document may currently be a PDF, and reusing that path for
 * a replacement photo would upload a JPEG under `application/pdf`.
 */

import { db, photoUploadService } from "@/components/providers/SystemProvider";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";
import type { PickedPhoto } from "@/utils/pickPhotos";
import { readAsBase64 } from "@/utils/readAsBase64";

import { writeLocalPhoto } from "./localFile";
import { forgetConfirmedMissingPhotoIds } from "./recoveryStore";
import { saveToGalleryIfCamera } from "./saveToGallery";

/** `doc_type` values, and the `Drivers` column each one mirrors to. */
const DRIVER_PATH_COLUMN = {
  license: "license_photo_path",
  insurance: "insurance_photo_path",
  medical_card: "medical_card_photo_path",
} as const;

export type DriverDocType = keyof typeof DRIVER_PATH_COLUMN;

export function isDriverDocType(value: string): value is DriverDocType {
  return value in DRIVER_PATH_COLUMN;
}

export type ReplaceDriverDocumentInput = {
  /** Existing `DriverDocuments.id` — reused, never re-created. */
  rowId: string;
  driverUuid: string;
  docType: DriverDocType;
  picked: PickedPhoto;
};

export type ReplaceDriverDocumentResult = {
  bucketPath: string;
  localUri: string;
};

/**
 * Writes the new file, points the row and the `Drivers` mirror at it in one
 * commit, and hands it straight back to the upload worker.
 */
export async function replaceDriverDocumentPhoto(
  input: ReplaceDriverDocumentInput,
): Promise<ReplaceDriverDocumentResult> {
  const bucketPath = `${input.driverUuid}/${input.docType}_${Date.now()}.${input.picked.ext}`;

  const base64 = await readAsBase64(input.picked.uri);
  const localUri = await writeLocalPhoto(base64, bucketPath);
  // Best-effort backup for camera captures (§4); never blocks the replace.
  void saveToGalleryIfCamera(localUri, input.picked.source);

  await executeTypedTransaction(async (tx) => {
    await tx.run(
      db
        .updateTable("DriverDocuments")
        .set({
          photo_path: bucketPath,
          upload_status: "pending",
          attempts: 0,
          last_attempt_at: null,
          last_error: null,
        })
        .where("id", "=", input.rowId)
        .compile(),
    );

    // The mirror has to move with the row: readers resolve a document through
    // `Drivers`, so leaving it on the old path would hide the new photo.
    await tx.run(
      db
        .updateTable("Drivers")
        .set({ [DRIVER_PATH_COLUMN[input.docType]]: bucketPath })
        .where("id", "=", input.driverUuid)
        .compile(),
    );
  });

  // The row now holds a different photo at a different path, so the earlier
  // bucket verdict no longer describes it.
  forgetConfirmedMissingPhotoIds([input.rowId]);

  void photoUploadService?.triggerFast();

  return { bucketPath, localUri };
}
