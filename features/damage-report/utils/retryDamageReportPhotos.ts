import { db, photoUploadService } from "@/components/providers/SystemProvider";
import { localPhotoExists } from "@/library/photoUploadQueue";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

export type RetryPhotosResult = { retried: number; needReAdd: number };

/**
 * Re-queue failed/pending damage photos for the given bucket paths. A photo
 * whose local copy is gone can't be retried automatically — it is reported in
 * `needReAdd`. Rows are only ever set back to `pending`; nothing is deleted.
 */
export async function retryDamageReportPhotos(
  photoPaths: string[],
): Promise<RetryPhotosResult> {
  let retried = 0;
  let needReAdd = 0;

  for (const path of photoPaths) {
    if (!(await localPhotoExists(path))) {
      needReAdd += 1;
      continue;
    }
    await executeTypedMutationVoid(
      db
        .updateTable("DamageReportPhotos")
        .set({
          upload_status: "pending",
          attempts: 0,
          last_attempt_at: null,
          last_error: null,
        })
        .where("photo_path", "=", path)
        .compile(),
    );
    retried += 1;
  }

  if (retried > 0) {
    void photoUploadService?.triggerFast();
  }

  return { retried, needReAdd };
}
