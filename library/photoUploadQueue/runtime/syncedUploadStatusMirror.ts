/**
 * The one write that tells the *server* a damage-report photo's file actually
 * landed in the bucket.
 *
 * WHY THIS EXISTS AT ALL
 * §3's bookkeeping moved to the device-local `PhotoUploadStatus` table so that
 * a drain of hundreds of photos stops filling PowerSync's `ps_crud` outbox
 * ahead of the driver's real writes (`AppSchema.ts`). That move was right for
 * every *intermediate* state — pending, uploading, failed, each retry — but it
 * also took away the only thing the server ever knew about an upload. A
 * `DamageReportPhotos` row syncs the instant it is created, long before its
 * file finishes uploading, so "the row is in Postgres" has never meant "the
 * photo is in the bucket". `upload_status` was the difference, and two things
 * outside this device depend on it: someone checking in Postgres whether a
 * report's photos really made it, and the upcoming `DamageReports.isReady`
 * gate that decides when a report is fit to show in the web admin.
 *
 * SO THIS IS A ONE-WAY MIRROR, NOT A SECOND SOURCE OF TRUTH
 * - It writes one value, `uploaded`, and only on the genuine terminal
 *   confirmation. `pending`/`uploading`/`failed` are never written here, which
 *   is the whole reason ordinary retries still cost zero CRUD entries.
 * - Nothing in the queue reads it. `claimNext`, the counts, the §6 banner, the
 *   §14 sweep and manual Retry all continue to read `PhotoUploadStatus`
 *   exclusively, so the device's own view of its work is unchanged.
 *
 * WRITTEN AT MOST ONCE PER PHOTO
 * The `upload_status <> 'uploaded'` guard is what makes "exactly once" true
 * rather than merely intended. A terminal `persist` can legitimately run more
 * than once for the same row — a duplicate confirmation from the §5.1
 * verification pass, or a re-attempt after a terminal write that could not be
 * recorded — and an UPDATE that matches no row produces no `ps_crud` entry at
 * all. The guard also has to admit NULL explicitly: SQL's `!=` is unknown
 * against NULL, and a photo that has never been mirrored is exactly the NULL
 * case.
 *
 * FAILURE IS DELIBERATELY NOT SWALLOWED
 * This runs inside `persist()`, under `persistWithRetry` and the §14
 * guaranteed-`failed` fallback, and it is left to throw like any other part of
 * the persist. Both writes go to the same local SQLite, so a failure here is
 * almost certainly a failure of the local-only write too — and the fallback's
 * outcome is self-healing: the row goes back to `failed`, is re-claimed, the
 * upload is re-confirmed (§5.1 resolves it against the bucket), and the mirror
 * runs again. Swallowing the error would instead leave the server permanently
 * unaware of a photo that did land, which is the one thing this module exists
 * to prevent.
 */

import { db } from "@/library/powersync/db";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

import type { UploadStatus } from "../types";

/** The only value ever mirrored to the synced row. */
const MIRRORED_STATUS: UploadStatus = "uploaded";

/**
 * Records `photoId`'s completed upload on the synced `DamageReportPhotos` row.
 *
 * Not driver-scoped, for the same reason `persist()` is not: the id always
 * comes from a row an already-scoped read returned, so re-checking ownership
 * here would buy nothing and cost a subquery on the hot write path.
 */
export async function mirrorTerminalUploadStatus(
  photoId: string,
): Promise<void> {
  await executeTypedMutationVoid(
    db
      .updateTable("DamageReportPhotos")
      .set({ upload_status: MIRRORED_STATUS })
      .where("id", "=", photoId)
      .where((eb) =>
        eb.or([
          eb("upload_status", "is", null),
          eb("upload_status", "!=", MIRRORED_STATUS),
        ]),
      )
      .compile(),
  );
}
