/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §6, "Banner behavior with multiple reports", and the
 * finalised copy in §11.6 (title "Photo Upload Issue", subtitle
 * "N report(s) have photos that failed to upload — tap to retry.").
 */

import {
  PHOTO_UPLOAD_BANNER_TITLE,
  deriveBannerState,
} from "@/library/photoUploadQueue/banner";
import type { ProblemReport } from "@/library/photoUploadQueue/types";

const NEWEST: ProblemReport = {
  reportUuid: "report-newest",
  createdAt: "2026-08-07T09:00:00.000Z",
};
const MIDDLE: ProblemReport = {
  reportUuid: "report-middle",
  createdAt: "2026-08-05T09:00:00.000Z",
};
const OLDEST: ProblemReport = {
  reportUuid: "report-oldest",
  createdAt: "2026-08-01T09:00:00.000Z",
};

// Deliberately unordered — the banner does the newest → oldest ordering.
const ALL = [MIDDLE, NEWEST, OLDEST];

describe("photo upload banner (§6)", () => {
  it("counts the problem reports and points at the newest one", () => {
    const banner = deriveBannerState(ALL);

    expect(banner.visible).toBe(true);
    expect(banner.count).toBe(3);
    expect(banner.targetReportUuid).toBe(NEWEST.reportUuid);
  });

  // §11.6 — copy is finalised in the doc, so it is part of the contract.
  it("renders the finalised title and a subtitle carrying the count", () => {
    const banner = deriveBannerState(ALL);

    expect(banner.title).toBe(PHOTO_UPLOAD_BANNER_TITLE);
    expect(PHOTO_UPLOAD_BANNER_TITLE).toBe("Photo Upload Issue");
    expect(banner.subtitle).toContain("3");
    expect(banner.subtitle.toLowerCase()).toContain("failed to upload");
    expect(banner.subtitle.toLowerCase()).toContain("tap to retry");
  });

  it("keeps the count in step with a single remaining report", () => {
    const banner = deriveBannerState([OLDEST]);

    expect(banner.visible).toBe(true);
    expect(banner.count).toBe(1);
    expect(banner.subtitle).toContain("1");
    expect(banner.targetReportUuid).toBe(OLDEST.reportUuid);
  });

  // §6 — "the banner's count drops by 1, and the next tap goes to the
  // next-most-recent problem report ... newest-to-oldest, one at a time".
  it("decrements and advances to the next-most-recent report as each is fixed", () => {
    const afterNewestFixed = deriveBannerState([MIDDLE, OLDEST]);
    expect(afterNewestFixed.count).toBe(2);
    expect(afterNewestFixed.targetReportUuid).toBe(MIDDLE.reportUuid);

    const afterMiddleFixed = deriveBannerState([OLDEST]);
    expect(afterMiddleFixed.count).toBe(1);
    expect(afterMiddleFixed.targetReportUuid).toBe(OLDEST.reportUuid);
  });

  it("disappears once the last problem report is cleared", () => {
    const banner = deriveBannerState([]);

    expect(banner.visible).toBe(false);
    expect(banner.count).toBe(0);
    expect(banner.targetReportUuid).toBeNull();
  });
});
