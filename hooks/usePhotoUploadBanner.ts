import { db } from "@/components/providers/SystemProvider";
import { useConfirmedMissingPhotoIds } from "@/hooks/useConfirmedMissingPhotoIds";
import {
  deriveBannerState,
  toProblemReports,
  type BannerState,
  type ProblemPhotoRow,
} from "@/library/photoUploadQueue";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

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
 */
export function usePhotoUploadBanner(): BannerState {
  const confirmedMissingPhotoIds = useConfirmedMissingPhotoIds();

  const compiled = useMemo(
    () =>
      db
        .selectFrom("DamageReportPhotos")
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
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<ProblemPhotoRow>());

  const problemReports = useMemo(
    () => toProblemReports(data ?? [], confirmedMissingPhotoIds),
    [data, confirmedMissingPhotoIds],
  );

  return useMemo(() => deriveBannerState(problemReports), [problemReports]);
}
