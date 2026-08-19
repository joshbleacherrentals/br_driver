import { useDriverScope } from "@/hooks/useDriverScope";
import {
  damageReportPhotosOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Deliberately without `thumbnail`.
 *
 * This query is reactive, and the upload queue writes to these very rows
 * several times per photo (an `attempt_started` reservation, then a terminal
 * outcome). Selecting the base64 `thumbnail` column meant every one of those
 * writes re-delivered every thumbnail on the report through the JS bridge, and
 * the screen then held a second copy for the image viewer — so a report's
 * thumbnails were re-materialised, in duplicate, for the entire time the queue
 * was working. Previews are now resolved once, non-reactively, by
 * `useReportPhotoPreviews`.
 */
export type DamageReportPhotoRow = {
  id: string;
  damage_report_uuid: string | null;
  photo_path: string | null;
  upload_status: string | null;
  /** `LOCAL_FILE_MISSING` means the row is parked — Retry can do nothing. */
  last_error: string | null;
  created_at: string | null;
};

export type PhotoUploadStatus = "pending" | "uploaded" | "failed";

export type DamageReportPhotoWithStatus = DamageReportPhotoRow & {
  uploadStatus: PhotoUploadStatus;
};

function toUploadStatus(raw: string | null): PhotoUploadStatus {
  if (raw === "uploaded") return "uploaded";
  if (raw === "failed") return "failed";
  return "pending";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * The query this hook runs, exported separately so it can be exercised directly
 * against a database in tests (same rationale as `usePhotoUploadBanner.ts`'s
 * `buildProblemPhotoRowsQuery`).
 *
 * §15 — built from `damageReportPhotosOf(scope)`, so a report id alone can no
 * longer produce rows. `DamageReportPhotos` syncs every driver's rows to every
 * device, and `DamageReportScreen` takes its `damageReportId` straight from
 * `useLocalSearchParams()` — a caller-controlled route param. Before scoping, a
 * deep link or a routing bug pointed at another driver's report id rendered that
 * driver's photos and, through `usePhotoRepair`, exposed Retry/Replace against
 * their rows.
 */
export function buildDamageReportPhotosQuery(
  scope: DriverScope,
  damageReportUuid: string,
) {
  return damageReportPhotosOf(scope)
    .select([
      "id",
      "damage_report_uuid",
      "photo_path",
      "upload_status",
      "last_error",
      "created_at",
    ])
    .where("damage_report_uuid", "=", damageReportUuid)
    .orderBy("created_at", "asc");
}

export function useDamageReportPhotos(
  damageReportUuid: string | null | undefined,
): {
  photos: DamageReportPhotoWithStatus[];
  isLoading: boolean;
  hasPending: boolean;
  hasFailed: boolean;
} {
  const scope = useDriverScope();

  // No scope, no query — not a placeholder id that would compile to a real read
  // against every driver's rows. `useTypedQuery` treats `null` as "disabled".
  const compiled = useMemo(
    () =>
      scope && damageReportUuid
        ? buildDamageReportPhotosQuery(scope, damageReportUuid).compile()
        : null,
    [scope, damageReportUuid],
  );

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportPhotoRow>(),
  );

  const photos = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        uploadStatus: toUploadStatus(row.upload_status),
      })),
    [data],
  );

  const hasPending = photos.some((p) => p.uploadStatus === "pending");
  const hasFailed = photos.some((p) => p.uploadStatus === "failed");

  return { photos, isLoading, hasPending, hasFailed };
}
