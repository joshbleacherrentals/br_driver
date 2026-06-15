import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DamageReportPhotoRow = {
  id: string;
  damage_report_uuid: string | null;
  photo_path: string | null;
  thumbnail: string | null;
  upload_status: string | null;
  created_at: string | null;
};

export type PhotoUploadStatus = "pending" | "uploaded";

export type DamageReportPhotoWithStatus = DamageReportPhotoRow & {
  uploadStatus: PhotoUploadStatus;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDamageReportPhotos(
  damageReportUuid: string | null | undefined,
): {
  photos: DamageReportPhotoWithStatus[];
  isLoading: boolean;
} {
  const safeId = damageReportUuid ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("DamageReportPhotos")
        .select([
          "id",
          "damage_report_uuid",
          "photo_path",
          "thumbnail",
          "upload_status",
          "created_at",
        ])
        .where("damage_report_uuid", "=", safeId)
        .orderBy("created_at", "asc")
        .compile(),
    [safeId],
  );

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportPhotoRow>(),
  );

  const photos = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        uploadStatus: (row.upload_status === "uploaded"
          ? "uploaded"
          : "pending") as PhotoUploadStatus,
      })),
    [data],
  );

  return { photos, isLoading };
}
