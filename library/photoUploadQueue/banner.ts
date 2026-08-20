/**
 * §6 ("Banner behavior with multiple reports"), §11.6 — banner copy + counter.
 *
 * NOT IMPLEMENTED. Mirrors the `ProfileCompletionBanner` title/subtitle shape
 * in components/widgets/onboardingBanner.tsx.
 */

import type { BannerState, ProblemReport } from "./types";

/** §11.6 — finalised copy. */
export const PHOTO_UPLOAD_BANNER_TITLE = "Photo Upload Issue";

/** §11.6 — finalised subtitle; `count` fills the leading "N". */
export function photoUploadBannerSubtitle(count: number): string {
  return `${count} report(s) have photos that failed to upload — tap to retry.`;
}

/**
 * Derives the banner from the reports that still have a problem photo.
 *
 * Contract (§6):
 * - the count is the number of problem reports;
 * - tapping targets the NEWEST problem report, not a list;
 * - fixing one drops the count and advances to the next-most-recent;
 * - at zero the banner disappears on its own.
 *
 * Input order is not significant — ordering is newest → oldest by `createdAt`.
 */
export function deriveBannerState(
  problemReports: readonly ProblemReport[],
): BannerState {
  if (problemReports.length === 0) {
    return {
      visible: false,
      count: 0,
      title: "",
      subtitle: "",
      targetReportUuid: null,
    };
  }

  // Newest → oldest by createdAt; the tap target is always the newest (§6).
  const newest = [...problemReports].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const count = problemReports.length;

  return {
    visible: true,
    count,
    title: PHOTO_UPLOAD_BANNER_TITLE,
    subtitle: photoUploadBannerSubtitle(count),
    targetReportUuid: newest.reportUuid,
  };
}
