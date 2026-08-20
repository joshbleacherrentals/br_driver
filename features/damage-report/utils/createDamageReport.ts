import { getPhotoUploadService } from "@/library/photoUploadQueue";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";
import { db } from "@/library/powersync/db";
import { randomUUID } from "expo-crypto";

import {
  DamageSeverityValue,
  severityValueToEnum,
} from "../components/DamageSeveritySelector";
import type { DocumentPhoto } from "../types";
import {
  prepareDamageReportPhotos,
  type DamageReportDraft,
  type PhotoPrepProgress,
} from "./prepareDamageReportPhotos";
import type { PhotoPrepFailure } from "./preparePhoto";

export type DamageReportFields = {
  bleacherUuid: string | null;
  inspectionUuid: string | null;
  seatDamage: DamageSeverityValue;
  haulDamage: DamageSeverityValue;
  note: string;
  /**
   * §15 — required, and a `DriverScope` rather than a string.
   *
   * `created_by_user_uuid` stopped being metadata: it is what decides whether
   * the upload queue may ever claim this report's photos, and what
   * `useDamageReportById`/`useDamageReportPhotos` scope their reads by. A
   * report left unattributed would own photos no driver's queue can claim —
   * they would sit on the phone forever and never reach the bucket. Taking the
   * branded scope, not an optional string, makes "forgot to attribute it" and
   * "attributed it to whatever the caller had lying around" both unwriteable.
   */
  scope: DriverScope;
};

export type CreateDamageReportInput = DamageReportFields & {
  photos: DocumentPhoto[];
  /** When true, abort mid-photo loop (e.g. user cancelled progress modal). */
  shouldAbort?: () => boolean;
  onPhotoProgress?: (progress: PhotoPrepProgress) => void;
};

export type CreateDamageReportResult =
  | {
      ok: true;
      damageId: string;
      /** Photo rows actually written — the modal's expected upload total. */
      savedPhotoCount: number;
      /**
       * Photos that never made it to disk. Non-empty here means a *partial*
       * save: the report exists and its saved photos will upload, and the
       * driver is told exactly how many did not (§2 — a row already saved must
       * still reach the bucket, so a partial save is never rolled back).
       */
      failures: PhotoPrepFailure[];
    }
  | { ok: false; reason: "aborted" }
  | { ok: false; reason: "all_photos_failed"; failures: PhotoPrepFailure[] };

/**
 * Phase 2: commit a prepared draft.
 *
 * The report row and every photo row go in one transaction, so the invariant
 * the product depends on — a damage report always has at least one photo —
 * holds at the database level rather than by convention. The files themselves
 * are already on disk and are never rolled back (§2/§3): a retry re-copies at
 * worst, and nothing that was captured is ever deleted.
 */
export async function commitDamageReport(
  draft: DamageReportDraft,
  fields: DamageReportFields,
): Promise<CreateDamageReportResult> {
  const now = new Date().toISOString();

  await executeTypedTransaction(async (tx) => {
    await tx.run(
      db
        .insertInto("DamageReports")
        .values({
          id: draft.damageId,
          inspection_uuid: fields.inspectionUuid,
          bleacher_uuid: fields.bleacherUuid,
          is_safe_to_sit: fields.seatDamage === null ? 1 : 0,
          is_safe_to_haul: fields.haulDamage === null ? 1 : 0,
          seat_damage: severityValueToEnum(fields.seatDamage),
          haul_damage: severityValueToEnum(fields.haulDamage),
          note: fields.note.trim() || null,
          created_at: now,
          resolved_at: null,
          maintenance_event_uuid: null,
          created_by_user_uuid: fields.scope.userUuid,
        })
        .compile(),
    );

    for (const photo of draft.photos) {
      await tx.run(
        db
          .insertInto("DamageReportPhotos")
          .values({
            id: randomUUID(),
            damage_report_uuid: draft.damageId,
            photo_path: photo.photoPath,
            thumbnail: photo.thumbnail,
            // No `upload_status`/`attempts` here any more: §3 bookkeeping lives
            // in the local-only `PhotoUploadStatus` table, where the *absence*
            // of a row means exactly "pending, never attempted". The queue
            // creates the row the first time it persists an outcome, so a saved
            // photo is claimable without a second write — and without a second
            // CRUD entry.
            // Same `now` as the report row above, and not optional: the upload
            // queue orders its claims by `created_at`
            // (`runtime/tableAdapters.ts`), so a row without one has no defined
            // position in the queue at all.
            created_at: now,
          })
          .compile(),
      );
    }
  });

  // Kick the queue: the user is here and waiting, so retry fast (§6/§7).
  void getPhotoUploadService()?.triggerFast();

  return {
    ok: true,
    damageId: draft.damageId,
    savedPhotoCount: draft.photos.length,
    failures: draft.failures,
  };
}

/**
 * Saves a damage report: every new photo to disk first, then — only if at least
 * one of them landed — the `DamageReports` row and its `DamageReportPhotos`
 * rows.
 *
 * That order is the whole point. The rows used to be written first and the
 * photos afterwards, so a selection whose files had all gone missing produced a
 * damage report with no evidence on it, and a cancel mid-loop left an orphaned
 * report row behind. Now nothing is written until there is something to write
 * about.
 */
export async function createDamageReport(
  input: CreateDamageReportInput,
): Promise<CreateDamageReportResult> {
  const prep = await prepareDamageReportPhotos({
    photos: input.photos,
    shouldAbort: input.shouldAbort,
    onPhotoProgress: input.onPhotoProgress,
  });

  if (!prep.ok) return prep;

  return commitDamageReport(prep.draft, input);
}
