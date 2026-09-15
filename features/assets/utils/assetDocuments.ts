/**
 * Where a bleacher's paperwork lives.
 *
 * The bucket names are the web app's — `bleacher-nvis` and
 * `bleacher-inspections` — and must stay the web app's: these are the same
 * objects the office uploaded, read from a second client, not a copy.
 */

import { supabasePublicObjectUrl } from "@/utils/shareImage";

export const NVIS_BUCKET = "bleacher-nvis";
export const ANNUAL_INSPECTION_BUCKET = "bleacher-inspections";

export function assetDocumentUrl(
  bucket: string,
  storagePath: string | null,
): string | null {
  if (!storagePath?.trim()) return null;
  return supabasePublicObjectUrl(bucket, storagePath.trim()) || null;
}
