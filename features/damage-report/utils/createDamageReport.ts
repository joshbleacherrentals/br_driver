import { db } from "@/components/providers/SystemProvider";
import {
  getPhotoUploadService,
  saveToGalleryIfCamera,
  writeLocalPhoto,
} from "@/library/photoUploadQueue";
import { executeTypedMutation } from "@/library/powersync/typedMutation";
import { generateThumbnail } from "@/utils/generateThumbnail";
import { readAsBase64 } from "@/utils/readAsBase64";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import {
  DamageSeverityValue,
  severityValueToEnum,
} from "../components/DamageSeveritySelector";
import type { DocumentPhoto } from "../types";

export type CreateDamageReportInput = {
  bleacherUuid: string | null;
  inspectionUuid: string | null;
  seatDamage: DamageSeverityValue;
  haulDamage: DamageSeverityValue;
  note: string;
  photos: DocumentPhoto[];
  createdByUserUuid?: string | null;
  /** When true, abort mid-photo loop (e.g. user cancelled progress modal). */
  shouldAbort?: () => boolean;
  onPhotoProgress?: (current: number, total: number) => void;
};

export type CreateDamageReportResult = {
  damageId: string;
  aborted: boolean;
  savedPhotoCount: number;
};

/**
 * Inserts a DamageReports row, then persists each new photo to disk +
 * DamageReportPhotos (attachment queue uploads in the background).
 */
export async function createDamageReport(
  input: CreateDamageReportInput,
): Promise<CreateDamageReportResult> {
  const damageId = randomUUID();
  const now = new Date().toISOString();

  await executeTypedMutation(
    db
      .insertInto("DamageReports")
      .values({
        id: damageId,
        inspection_uuid: input.inspectionUuid,
        bleacher_uuid: input.bleacherUuid,
        is_safe_to_sit: input.seatDamage === null ? 1 : 0,
        is_safe_to_haul: input.haulDamage === null ? 1 : 0,
        seat_damage: severityValueToEnum(input.seatDamage),
        haul_damage: severityValueToEnum(input.haulDamage),
        note: input.note.trim() || null,
        created_at: now,
        resolved_at: null,
        maintenance_event_uuid: null,
        created_by_user_uuid: input.createdByUserUuid ?? null,
      })
      .compile(),
  );

  const newPhotos = input.photos.filter((p) => p.isNew && p.uri);
  input.onPhotoProgress?.(0, newPhotos.length);

  let savedPhotoCount = 0;

  for (let i = 0; i < newPhotos.length; i++) {
    if (input.shouldAbort?.()) {
      return { damageId, aborted: true, savedPhotoCount };
    }

    const photo = newPhotos[i];
    try {
      const fileInfo = await FileSystem.getInfoAsync(photo.uri!);
      if (!fileInfo.exists) {
        console.warn("[createDamageReport] photo file missing:", photo.uri);
        input.onPhotoProgress?.(i + 1, newPhotos.length);
        continue;
      }

      const base64 = await readAsBase64(photo.uri!);

      let thumb: string | null = null;
      try {
        thumb = await generateThumbnail(photo.uri!);
      } catch (e) {
        console.warn("[createDamageReport] thumbnail failed:", e);
      }

      const ext = photo.ext ?? "jpg";
      const filename = `${damageId}/photo_${i}_${Date.now()}.${ext}`;

      // Write the stable local copy first, then record the row with
      // upload_status = pending. The worker recomputes the local path live
      // from photo_path (never deleting it — §2, §3) — no attachment-queue
      // archival can lose it.
      const localUri = await writeLocalPhoto(base64, filename);

      // Camera captures are the only copy until now — duplicate to the gallery
      // as a safety backup (§4). Best-effort; never blocks the save.
      void saveToGalleryIfCamera(localUri, photo.source);

      await executeTypedMutation(
        db
          .insertInto("DamageReportPhotos")
          .values({
            id: randomUUID(),
            damage_report_uuid: damageId,
            photo_path: filename,
            thumbnail: thumb,
            upload_status: "pending",
            attempts: 0,
          })
          .compile(),
      );

      savedPhotoCount++;
    } catch (err) {
      console.warn("[createDamageReport] photo save failed:", err);
    }

    input.onPhotoProgress?.(i + 1, newPhotos.length);
  }

  // Kick the queue: the user is here and waiting, so retry fast (§6/§7).
  void getPhotoUploadService()?.triggerFast();

  return { damageId, aborted: false, savedPhotoCount };
}
