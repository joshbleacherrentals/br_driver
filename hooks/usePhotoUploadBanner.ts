import { useConfirmedMissingPhotoIds } from "@/hooks/useConfirmedMissingPhotoIds";
import { useDriverScope } from "@/hooks/useDriverScope";
import {
  deriveBannerState,
  toProblemReports,
  type BannerState,
  type ProblemPhotoRow,
} from "@/library/photoUploadQueue";
import {
  damageReportPhotosOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

/**
 * The banner's own read of unresolved damage-report photos, driver-scoped (§15).
 *
 * This is the one consumer that does not go through `tableAdapters.ts` — it
 * needs the owning report's id and timestamp, which the queue's row shape does
 * not carry — so it joins `DamageReports` where the adapters do not. Ownership
 * itself is not repeated here: the query starts from `damageReportPhotosOf`,
 * the same scoped source the adapters use, so the join is only ever a lookup
 * for those two extra columns. Without scoping the banner would count, and tap
 * through to, damage reports belonging to other drivers, which sync to this
 * device too (§15).
 *
 * Resolved reports are excluded (`resolved_at IS NULL`, same convention as
 * `hooks/db/useDamageReport.ts`): once a report is closed its photo can never
 * be replaced, so a still-missing photo on one is not a problem the banner can
 * do anything about, and would otherwise never stop counting.
 *
 * Exported apart from the hook so the SQL can be exercised directly against a
 * database in tests, with no React involved.
 */
export function buildProblemPhotoRowsQuery(scope: DriverScope) {
  return damageReportPhotosOf(scope)
    .innerJoin(
      "DamageReports",
      "DamageReports.id",
      "DamageReportPhotos.damage_report_uuid",
    )
    .select([
      "DamageReportPhotos.id as photo_id",
      "DamageReports.id as report_uuid",
      "DamageReports.created_at as report_created_at",
    ])
    .where("DamageReportPhotos.upload_status", "in", ["pending", "failed"])
    .where("DamageReports.resolved_at", "is", null);
}

/**
 * §6 — state for the app-wide "Photo Upload Issue" banner.
 *
 * Two independent inputs are combined, and both are required:
 *
 * - the **live local DB**, which knows which damage-report photos are still not
 *   `uploaded`. Being reactive is what makes the count fall on its own as
 *   photos land, and the banner disappear once the last one clears (§6);
 * - the **recovery gate**, which knows which of those the bucket was actually
 *   asked about and confirmed missing. §6.2 forbids bannering on local status
 *   alone, so an unverified photo is deliberately invisible here.
 *
 * Scope is damage reports specifically: the banner counts "N report(s)" and taps
 * through to one report, which inspection photos and driver documents have no
 * equivalent of. They are still uploaded, retried and backed off by the same
 * queue, and still surface in-context on their own screens.
 *
 * Which reports, in turn, is scoped to the signed-in driver (§15) — taken from
 * `useDriverScope()`, the app's single resolver, rather than re-running the
 * Clerk → `Users` chain here. Until that resolves there is no query at all, so
 * the banner stays silent rather than briefly counting everyone's photos.
 */
export function usePhotoUploadBanner(): BannerState {
  const confirmedMissingPhotoIds = useConfirmedMissingPhotoIds();
  const scope = useDriverScope();

  const compiled = useMemo(
    () => (scope ? buildProblemPhotoRowsQuery(scope).compile() : null),
    [scope],
  );

  const { data } = useTypedQuery(compiled, expect<ProblemPhotoRow>());

  const problemReports = useMemo(
    () => toProblemReports(data ?? [], confirmedMissingPhotoIds),
    [data, confirmedMissingPhotoIds],
  );

  return useMemo(() => deriveBannerState(problemReports), [problemReports]);
}
