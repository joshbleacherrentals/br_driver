import {
  requeuePhotoRows,
  type RequeueResult,
  type RequeueTarget,
} from "@/library/photoUploadQueue";

export type RetryPhotosResult = RequeueResult;

/**
 * Re-queue failed/pending damage photos. A photo whose local copy is gone can't
 * be retried automatically — it is reported in `needReAdd`, and the driver has
 * to supply a replacement instead. Rows are only ever set back to `pending`;
 * nothing is deleted.
 */
export async function retryDamageReportPhotos(
  photos: readonly RequeueTarget[],
): Promise<RetryPhotosResult> {
  return requeuePhotoRows("DamageReportPhotos", photos);
}
