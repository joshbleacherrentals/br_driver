import {
  DAMAGE_PHOTO_ATTACHMENT_TABLE,
} from "@/library/powersync/AppSchema";
import { usePowerSyncQuery } from "@powersync/react-native";
import { useMemo } from "react";

export type DamageReportPhotoRow = {
  id: string;
  damage_report_uuid: string | null;
  photo_path: string | null;
  thumbnail: string | null;
  created_at: string | null;
};

export type PhotoUploadStatus = "pending" | "uploading" | "synced" | "failed";

export type DamageReportPhotoWithStatus = DamageReportPhotoRow & {
  uploadStatus: PhotoUploadStatus;
};

function attachmentStateToStatus(state: number | null | undefined): PhotoUploadStatus {
  if (state === 3) return "synced";
  if (state === 0 || state === 1) return "uploading";
  if (state === 4) return "failed";
  return "pending";
}

type JoinedRow = {
  id: string;
  damage_report_uuid: string | null;
  photo_path: string | null;
  thumbnail: string | null;
  created_at: string | null;
  attachment_state: number | null;
};

export function useDamageReportPhotos(
  damageReportUuid: string | null | undefined,
): {
  photos: DamageReportPhotoWithStatus[];
  isLoading: boolean;
} {
  const safeId = damageReportUuid ?? "__none__";

  const rows = usePowerSyncQuery<JoinedRow>(
    `SELECT
       p.id,
       p.damage_report_uuid,
       p.photo_path,
       p.thumbnail,
       p.created_at,
       a.state AS attachment_state
     FROM "DamageReportPhotos" p
     LEFT JOIN "${DAMAGE_PHOTO_ATTACHMENT_TABLE}" a
       ON a.id = p.photo_path
     WHERE p.damage_report_uuid = ?
     ORDER BY p.created_at ASC`,
    [safeId],
  );

  const photos = useMemo(
    () =>
      (rows ?? []).map((row) => ({
        id: row.id,
        damage_report_uuid: row.damage_report_uuid,
        photo_path: row.photo_path,
        thumbnail: row.thumbnail,
        created_at: row.created_at,
        uploadStatus: attachmentStateToStatus(row.attachment_state),
      })),
    [rows],
  );

  return { photos, isLoading: false };
}
