/**
 * Grid previews for a saved report's photos, resolved once instead of watched.
 *
 * `useDamageReportPhotos` is a reactive query, and the upload queue writes to
 * those rows repeatedly while it works. Anything that query selects is
 * therefore re-delivered on every write — which is why the base64 `thumbnail`
 * column no longer belongs in it (see that hook's own note). Previews change
 * only when the *set of photos* changes, so they are resolved here, keyed on
 * the photo identities and nothing else.
 *
 * Two sources, in this order:
 *  1. the synced `thumbnail` (≈200px) — small by construction, so thirty of
 *     them cost about as much as one photo;
 *  2. the local file, for rows that predate thumbnails or arrived without one.
 *     Full resolution, hence second: `expo-image` downsamples it to the tile,
 *     but there is no reason to make it do that work when a thumbnail exists.
 */

import { useDriverScope } from "@/hooks/useDriverScope";
import { localPhotoExists, localUriForPath } from "@/library/photoUploadQueue";
import {
  damageReportPhotosOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { useEffect, useRef, useState } from "react";

export type ReportPhotoPreview = {
  /** What the grid renders. Undefined until resolved, or if nothing was found. */
  uri?: string;
  /** Raw base64, for the full-screen viewer's load-failure fallback. */
  thumbnail?: string;
};

export type ReportPhotoPreviews = Record<string, ReportPhotoPreview>;

/** The photo identity this hook needs — a subset of the reactive row. */
export type PreviewablePhoto = {
  id: string;
  photo_path: string | null;
};

/**
 * §15 — scoped like every other read of this table. The ids come from an
 * already-scoped query, so this is belt and braces rather than the only guard,
 * but an unscoped read of `DamageReportPhotos` should not exist at all.
 */
function buildThumbnailQuery(scope: DriverScope, ids: string[]) {
  return damageReportPhotosOf(scope)
    .select(["id", "thumbnail"])
    .where("id", "in", ids);
}

export function useReportPhotoPreviews(
  photos: PreviewablePhoto[],
): ReportPhotoPreviews {
  const scope = useDriverScope();
  const [previews, setPreviews] = useState<ReportPhotoPreviews>({});

  // The identity of the photo *set*, which is what previews actually depend on
  // — as opposed to the array's object identity, which changes on every write
  // the upload queue makes to any of these rows.
  const key = photos.map((photo) => `${photo.id}:${photo.photo_path ?? ""}`).join("|");

  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    if (!scope) return;

    const current = photosRef.current;
    if (current.length === 0) {
      setPreviews({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const resolved: ReportPhotoPreviews = {};

      const rows = await buildThumbnailQuery(
        scope,
        current.map((photo) => photo.id),
      ).execute();

      const thumbnails = new Map(
        rows.map((row) => [row.id, row.thumbnail ?? null]),
      );

      for (const photo of current) {
        const thumbnail = thumbnails.get(photo.id) ?? null;
        if (thumbnail) {
          resolved[photo.id] = {
            uri: `data:image/jpeg;base64,${thumbnail}`,
            thumbnail,
          };
          continue;
        }

        if (photo.photo_path && (await localPhotoExists(photo.photo_path))) {
          resolved[photo.id] = { uri: localUriForPath(photo.photo_path) };
        } else {
          resolved[photo.id] = {};
        }
      }

      if (!cancelled) setPreviews(resolved);
    })().catch((error) => {
      console.warn("[useReportPhotoPreviews] could not resolve previews:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [key, scope]);

  return previews;
}
