import { localPhotoExists, localUriForPath } from "@/library/photoUploadQueue";
import { supabasePublicObjectUrl } from "@/utils/shareImage";

const BUCKET = "driver-documents";

/**
 * Resolves a `Drivers.<doc>_photo_path` / `DriverDocuments.photo_path` value to
 * a displayable URI: the local on-device copy if the upload queue ever wrote
 * one, otherwise the bucket's public URL. A document set outside the queue
 * (admin dashboard, a backfilled legacy path) was never captured on this
 * device, so `localUriForPath` resolves to a path with no file behind it —
 * this is the fallback for that case. Mirrors damage-report's
 * `resolvePhotoUri`.
 */
export async function resolveDriverDocumentUri(
  photoPath: string,
): Promise<string> {
  if (await localPhotoExists(photoPath)) return localUriForPath(photoPath);

  // Unlike the app's own generated paths (`{driverId}/{docType}_{ts}.{ext}`),
  // an admin-uploaded or backfilled path can carry spaces/parens — encode each
  // segment so the URL is valid without touching the `/` separators.
  const encodedPath = photoPath.split("/").map(encodeURIComponent).join("/");
  return supabasePublicObjectUrl(BUCKET, encodedPath);
}
