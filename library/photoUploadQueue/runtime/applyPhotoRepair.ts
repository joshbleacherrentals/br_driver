/**
 * Carries out a planned photo repair (see `../photoRepair.ts` for the plan).
 *
 * Two invariants shape this module:
 *
 * 1. **`photo_path` is never rewritten for a reused row.** The path is what
 *    every other reference points at — a damage report's grid, an inspection's
 *    `answers_json`, `Drivers.*_photo_path`. Because the row is
 *    bucket-confirmed-missing, nothing sits at that path, so writing a new local
 *    file under it is safe and keeps all those references correct for free.
 * 2. **Deleting a row is only ever allowed for a confirmed-missing row.** Such a
 *    row never reached `uploaded`, so there is no bucket object to orphan. This
 *    is the single exception to §3's "a row is never deleted".
 *
 * File writes happen up front, outside the write lock; every row change then
 * commits in one transaction, so a failure can never leave a report half
 * repaired.
 */

import { db, photoUploadService } from "@/components/providers/SystemProvider";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";
import { generateThumbnail } from "@/utils/generateThumbnail";
import type { PickedPhoto } from "@/utils/pickPhotos";
import { readAsBase64 } from "@/utils/readAsBase64";
import { randomUUID } from "expo-crypto";

import {
  applyPhotoChangesToAnswers,
  findQuestionForPhoto,
  firstPhotoQuestion,
} from "../inspectionAnswers";
import type { PhotoReplacementPlan } from "../photoRepair";
import { writeLocalPhoto } from "./localFile";
import { forgetConfirmedMissingPhotoIds } from "./recoveryStore";
import { saveToGalleryIfCamera } from "./saveToGallery";

/** The parent record being repaired, and the table its photos live in. */
export type RepairParent =
  | { table: "DamageReportPhotos"; damageReportUuid: string }
  | { table: "InspectionPhotos"; inspectionUuid: string };

/** A confirmed-missing row the plan may reuse or delete. */
export type RepairRowRef = {
  id: string;
  /** `photo_path` / `storage_path`. */
  bucketPath: string;
};

/** The queue columns a repaired row is reset to — identical to a fresh save. */
const REPAIRED = {
  upload_status: "pending",
  attempts: 0,
  last_attempt_at: null,
  last_error: null,
} as const;

type PreparedReuse = {
  rowId: string;
  thumbnail: string | null;
};

type PreparedInsert = {
  bucketPath: string;
  thumbnail: string | null;
};

async function thumbnailFor(uri: string): Promise<string | null> {
  try {
    return await generateThumbnail(uri);
  } catch (err) {
    console.warn("[applyPhotoRepair] thumbnail failed:", err);
    return null;
  }
}

/**
 * Writes the picked file to the stable local location for `bucketPath` and
 * mirrors camera captures to the gallery (§4). The local path is always
 * recomputed live from `bucketPath` by later readers (`localUriForPath`) —
 * nothing here needs to carry the URI forward.
 */
async function persistPickedPhoto(
  picked: PickedPhoto,
  bucketPath: string,
): Promise<void> {
  const base64 = await readAsBase64(picked.uri);
  const localUri = await writeLocalPhoto(base64, bucketPath);
  // Best-effort backup; never blocks the repair.
  void saveToGalleryIfCamera(localUri, picked.source);
}

export type ApplyPhotoRepairInput = {
  parent: RepairParent;
  plan: PhotoReplacementPlan;
  /** Every confirmed-missing row the plan refers to, keyed by row id. */
  rowsById: ReadonlyMap<string, RepairRowRef>;
  picked: readonly PickedPhoto[];
};

export type ApplyPhotoRepairResult = {
  replaced: number;
  added: number;
  removed: number;
};

/**
 * Applies the plan and hands the affected rows back to the upload worker.
 *
 * Throws if any file write fails — nothing has been committed at that point, so
 * the caller can report the failure with the record still intact.
 */
export async function applyPhotoRepair(
  input: ApplyPhotoRepairInput,
): Promise<ApplyPhotoRepairResult> {
  const { parent, plan, rowsById, picked } = input;
  const wantsThumbnail = parent.table === "DamageReportPhotos";

  // ── 1. Files first, outside the write lock ────────────────────────────────

  const reuses: PreparedReuse[] = [];
  for (const pairing of plan.reuse) {
    const row = rowsById.get(pairing.rowId);
    const photo = picked[pairing.pickedIndex];
    if (!row || !photo) continue;

    await persistPickedPhoto(photo, row.bucketPath);
    reuses.push({
      rowId: row.id,
      thumbnail: wantsThumbnail ? await thumbnailFor(photo.uri) : null,
    });
  }

  const deletedPaths = plan.deletions
    .map((rowId) => rowsById.get(rowId)?.bucketPath)
    .filter((path): path is string => !!path);

  // Extra inspection photos have to join an existing photo question, otherwise
  // they would never render. Prefer the question the repaired photos came from.
  const inspectionAnswersJson =
    parent.table === "InspectionPhotos" && plan.extras.length + deletedPaths.length > 0
      ? await readInspectionAnswers(parent.inspectionUuid)
      : null;

  const extraQuestionId =
    parent.table === "InspectionPhotos" && plan.extras.length > 0
      ? questionForExtras(
          inspectionAnswersJson,
          // Only the rows being repaired: an extra belongs with the photos it is
          // topping up, not with whichever healthy photo happens to sort first.
          [...plan.reuse.map((pair) => pair.rowId), ...plan.deletions]
            .map((rowId) => rowsById.get(rowId)?.bucketPath)
            .filter((path): path is string => !!path),
        )
      : null;

  const inserts: PreparedInsert[] = [];
  const stamp = Date.now();
  for (const pickedIndex of plan.extras) {
    const photo = picked[pickedIndex];
    if (!photo) continue;

    const bucketPath =
      parent.table === "DamageReportPhotos"
        ? `${parent.damageReportUuid}/photo_${stamp}_${pickedIndex}.${photo.ext}`
        : extraQuestionId
          ? `${parent.inspectionUuid}/${extraQuestionId}/photo_${stamp}_${pickedIndex}.${photo.ext}`
          : null;

    if (!bucketPath) {
      // No question to attach it to — adding an unreferenced row would produce
      // a photo the driver can never see. Skipping is the honest outcome.
      console.warn(
        "[applyPhotoRepair] no photo question for extra inspection photo; skipped",
      );
      continue;
    }

    await persistPickedPhoto(photo, bucketPath);
    inserts.push({
      bucketPath,
      thumbnail: wantsThumbnail ? await thumbnailFor(photo.uri) : null,
    });
  }

  const nextAnswersJson =
    parent.table === "InspectionPhotos"
      ? applyPhotoChangesToAnswers(inspectionAnswersJson, {
          removedPaths: deletedPaths,
          addedPathsByQuestion: extraQuestionId
            ? { [extraQuestionId]: inserts.map((i) => i.bucketPath) }
            : {},
        })
      : null;

  // ── 2. One atomic commit ──────────────────────────────────────────────────

  await executeTypedTransaction(async (tx) => {
    if (parent.table === "DamageReportPhotos") {
      for (const reuse of reuses) {
        await tx.run(
          db
            .updateTable("DamageReportPhotos")
            .set({
              ...REPAIRED,
              thumbnail: reuse.thumbnail,
            })
            .where("id", "=", reuse.rowId)
            .compile(),
        );
      }
      for (const insert of inserts) {
        await tx.run(
          db
            .insertInto("DamageReportPhotos")
            .values({
              id: randomUUID(),
              damage_report_uuid: parent.damageReportUuid,
              photo_path: insert.bucketPath,
              thumbnail: insert.thumbnail,
              upload_status: "pending",
              attempts: 0,
            })
            .compile(),
        );
      }
      if (plan.deletions.length > 0) {
        await tx.run(
          db
            .deleteFrom("DamageReportPhotos")
            .where("id", "in", [...plan.deletions])
            .compile(),
        );
      }
    } else {
      for (const reuse of reuses) {
        await tx.run(
          db
            .updateTable("InspectionPhotos")
            .set({ ...REPAIRED })
            .where("id", "=", reuse.rowId)
            .compile(),
        );
      }
      for (const insert of inserts) {
        await tx.run(
          db
            .insertInto("InspectionPhotos")
            .values({
              id: randomUUID(),
              inspection_uuid: parent.inspectionUuid,
              storage_path: insert.bucketPath,
              upload_status: "pending",
              attempts: 0,
            })
            .compile(),
        );
      }
      if (plan.deletions.length > 0) {
        await tx.run(
          db
            .deleteFrom("InspectionPhotos")
            .where("id", "in", [...plan.deletions])
            .compile(),
        );
      }
      // Same commit as the rows themselves — the JSON and the table must never
      // be observable in disagreement.
      if (nextAnswersJson !== null) {
        await tx.run(
          db
            .updateTable("WorkTrackerInspections")
            .set({ answers_json: nextAnswersJson })
            .where("id", "=", parent.inspectionUuid)
            .compile(),
        );
      }
    }
  });

  // These rows are no longer what the bucket was asked about: each carries a new
  // photo, or is gone. Retiring the verdict is what stops the "photo was never
  // stored" warning from persisting immediately after the driver fixed it.
  forgetConfirmedMissingPhotoIds([
    ...reuses.map((reuse) => reuse.rowId),
    ...plan.deletions,
  ]);

  // The driver is standing here waiting — retry hard, not on the background
  // cadence (§6/§7).
  void photoUploadService?.triggerFast();

  return {
    replaced: reuses.length,
    added: inserts.length,
    removed: plan.deletions.length,
  };
}

async function readInspectionAnswers(
  inspectionUuid: string,
): Promise<string | null> {
  const rows = await db
    .selectFrom("WorkTrackerInspections")
    .select("answers_json")
    .where("id", "=", inspectionUuid)
    .limit(1)
    .execute();
  return rows[0]?.answers_json ?? null;
}

/**
 * The question extra photos should join: the one that owned a repaired photo,
 * falling back to the inspection's first photo question.
 */
function questionForExtras(
  answersJson: string | null,
  repairedPaths: readonly string[],
): string | null {
  for (const path of repairedPaths) {
    const questionId = findQuestionForPhoto(answersJson, path);
    if (questionId) return questionId;
  }
  return firstPhotoQuestion(answersJson);
}
