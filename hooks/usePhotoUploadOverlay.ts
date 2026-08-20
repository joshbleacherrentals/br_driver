import { useConfirmedMissingPhotoIds } from "@/hooks/useConfirmedMissingPhotoIds";
import { useDriverScope } from "@/hooks/useDriverScope";
import {
  deriveBannerState,
  derivePhotoUploadOverlayState,
  deriveUploadActivity,
  isUnresolvedUploadStatus,
  toProblemReports,
  type PhotoUploadOverlayState,
  type UploadActivityRow,
} from "@/library/photoUploadQueue";
import {
  damageReportPhotosOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The overlay's own read of the driver's damage-report photos, driver-scoped
 * (§15).
 *
 * This is the one consumer that does not go through `tableAdapters.ts` — it
 * needs the owning report's id and timestamp, which the queue's row shape does
 * not carry — so it joins `DamageReports` where the adapters do not. Ownership
 * itself is not repeated here: the query starts from `damageReportPhotosOf`,
 * the same scoped source the adapters use, so the join is only ever a lookup
 * for those two extra columns. Without scoping the overlay would count, and tap
 * through to, damage reports belonging to other drivers, which sync to this
 * device too (§15).
 *
 * Resolved reports are excluded (`resolved_at IS NULL`, same convention as
 * `hooks/db/useDamageReport.ts`): once a report is closed its photo can never
 * be replaced, so a still-missing photo on one is not a problem the overlay can
 * do anything about, and would otherwise never stop counting.
 *
 * Unlike the query it replaces, this one does **not** filter out uploaded rows.
 * The progress state needs them — they are the numerator of "X of Y" — and one
 * reactive query feeding both states is cheaper than two watching the same two
 * tables. The §6 row set is recovered in JS by `isUnresolvedUploadStatus`,
 * which admits exactly what the old SQL-side filter admitted.
 *
 * Status comes from the local-only `PhotoUploadStatus` table exclusively, never
 * from the synced `DamageReportPhotos.upload_status` mirror — see
 * `runtime/syncedUploadStatusMirror.ts` for why that mirror is not a second
 * source of truth.
 *
 * Exported apart from the hook so the SQL can be exercised directly against a
 * database in tests, with no React involved.
 */
export function buildUploadActivityRowsQuery(scope: DriverScope) {
  return damageReportPhotosOf(scope)
    .innerJoin(
      "DamageReports",
      "DamageReports.id",
      "DamageReportPhotos.damage_report_uuid",
    )
    .leftJoin(
      "PhotoUploadStatus",
      "PhotoUploadStatus.id",
      "DamageReportPhotos.id",
    )
    .select([
      "DamageReportPhotos.id as photo_id",
      "DamageReports.id as report_uuid",
      "DamageReports.created_at as report_created_at",
      "PhotoUploadStatus.upload_status as upload_status",
      "PhotoUploadStatus.last_error as last_error",
    ])
    .where("DamageReports.resolved_at", "is", null);
}

export type PhotoUploadOverlay = {
  state: PhotoUploadOverlayState;
  /** Called by the view once the success state has finished animating out. */
  endCelebration: () => void;
};

/**
 * State for the app-wide floating photo-upload banner.
 *
 * Three independent inputs are combined:
 *
 * - the **live local DB**, which knows the status of every photo on the
 *   driver's open reports. Being reactive is what makes the count climb on its
 *   own as photos land, and the banner disappear once the last one clears;
 * - the **recovery gate**, which knows which unresolved photos the bucket was
 *   actually asked about and confirmed missing. §6.2 forbids bannering a
 *   failure on local status alone, so an unverified photo is deliberately
 *   invisible to the failed state (it still counts as in-flight);
 * - a **local completion edge**, below. PowerSync's reactive queries report
 *   values, not transitions, so "the last photo just landed" has to be observed
 *   by comparing consecutive counts — there is no event to subscribe to.
 *
 * Scope is damage reports specifically: the failed state counts "N report(s)"
 * and taps through to one report, which inspection photos and driver documents
 * have no equivalent of. They are still uploaded, retried and backed off by the
 * same queue, and still surface in-context on their own screens.
 *
 * Which reports, in turn, is scoped to the signed-in driver (§15) — taken from
 * `useDriverScope()`, the app's single resolver, rather than re-running the
 * Clerk → `Users` chain here. Until that resolves there is no query at all, so
 * the banner stays silent rather than briefly counting everyone's photos.
 */
export function usePhotoUploadOverlay(): PhotoUploadOverlay {
  const confirmedMissingPhotoIds = useConfirmedMissingPhotoIds();
  const scope = useDriverScope();

  const compiled = useMemo(
    () => (scope ? buildUploadActivityRowsQuery(scope).compile() : null),
    [scope],
  );

  const { data } = useTypedQuery(compiled, expect<UploadActivityRow>());

  const rows = useMemo(() => data ?? [], [data]);

  const activity = useMemo(() => deriveUploadActivity(rows), [rows]);

  const failure = useMemo(() => {
    const unresolved = rows.filter((row) =>
      isUnresolvedUploadStatus(row.upload_status),
    );
    return deriveBannerState(
      toProblemReports(unresolved, confirmedMissingPhotoIds),
    );
  }, [rows, confirmedMissingPhotoIds]);

  // ── The completion edge ───────────────────────────────────────────────────
  //
  // The previous count lives in a ref, not in state: nothing renders it, it is
  // only ever compared against the next value, and holding it in state would
  // cost a second render for every write the queue makes. Only the conclusion
  // drawn from it — "a batch just finished" — is state, because that is what
  // the view shows.
  const [celebrating, setCelebrating] = useState(false);
  const previousInFlight = useRef(0);

  useEffect(() => {
    const previous = previousInFlight.current;
    previousInFlight.current = activity.inFlight;

    // Something is (still) uploading: any earlier celebration is stale, and a
    // new one is not owed until this batch finishes.
    if (activity.inFlight > 0) {
      setCelebrating(false);
      return;
    }
    // Nothing in flight and nothing was: a fresh mount, not a completion. This
    // is what stops the banner congratulating the driver on app launch.
    if (previous === 0) return;

    setCelebrating(true);
  }, [activity.inFlight]);

  // A confirmed-missing photo means the batch did not, in fact, all land. The
  // failed state already outranks success for display; clearing the flag as
  // well stops a stale celebration surfacing later, once the failure clears.
  useEffect(() => {
    if (failure.visible) setCelebrating(false);
  }, [failure.visible]);

  const endCelebration = useCallback(() => setCelebrating(false), []);

  const state = useMemo(
    () => derivePhotoUploadOverlayState({ activity, failure, celebrating }),
    [activity, failure, celebrating],
  );

  return { state, endCelebration };
}
