/**
 * Covers: design doc §6, "Banner behavior with multiple reports" — the step
 * between "which photos are unresolved" and `deriveBannerState`.
 *
 * Two rules from §6 are encoded here:
 *   - §6.2/6.3: a photo only becomes a banner-worthy problem once a direct
 *     bucket check confirmed the object is genuinely missing. An unverified
 *     `pending`/`failed` row must never reach the banner.
 *   - §6 "Banner behavior with multiple reports": the banner counts *reports*,
 *     so several bad photos on one report are one problem, not many.
 */

import {
  ProblemPhotoRow,
  toProblemReports,
} from "@/library/photoUploadQueue/problemReports";

const row = (
  photo_id: string,
  report_uuid: string,
  report_created_at: string | null,
): ProblemPhotoRow => ({ photo_id, report_uuid, report_created_at });

const NEWEST = row("photo-a", "report-newest", "2026-08-07T09:00:00.000Z");
const MIDDLE = row("photo-b", "report-middle", "2026-08-05T09:00:00.000Z");
const OLDEST = row("photo-c", "report-oldest", "2026-08-01T09:00:00.000Z");

const all = new Set(["photo-a", "photo-b", "photo-c"]);

describe("problem reports for the upload banner (§6)", () => {
  it("maps each verified-missing photo to its report", () => {
    expect(toProblemReports([MIDDLE, NEWEST, OLDEST], all)).toEqual([
      { reportUuid: "report-newest", createdAt: "2026-08-07T09:00:00.000Z" },
      { reportUuid: "report-middle", createdAt: "2026-08-05T09:00:00.000Z" },
      { reportUuid: "report-oldest", createdAt: "2026-08-01T09:00:00.000Z" },
    ]);
  });

  // §6.2 — "before showing anything, we run a direct verification against the
  // bucket (not just trusting the local upload_status)".
  it("ignores unresolved photos whose object was never verified missing", () => {
    expect(toProblemReports([MIDDLE, NEWEST, OLDEST], new Set())).toEqual([]);

    expect(toProblemReports([MIDDLE, NEWEST, OLDEST], new Set(["photo-b"]))).toEqual(
      [{ reportUuid: "report-middle", createdAt: "2026-08-05T09:00:00.000Z" }],
    );
  });

  // §6 — the counter is "N report(s)", so one report is one entry no matter how
  // many of its photos failed.
  it("collapses several bad photos on one report into a single entry", () => {
    const reports = toProblemReports(
      [
        row("photo-1", "report-x", "2026-08-05T09:00:00.000Z"),
        row("photo-2", "report-x", "2026-08-05T09:00:00.000Z"),
        row("photo-3", "report-x", "2026-08-05T09:00:00.000Z"),
      ],
      new Set(["photo-1", "photo-2", "photo-3"]),
    );

    expect(reports).toHaveLength(1);
    expect(reports[0].reportUuid).toBe("report-x");
  });

  // A missing timestamp must not silently drop a genuinely lost photo; it just
  // sorts last, so the banner still counts it and still reaches it eventually.
  it("keeps a report whose created_at is null, ordered oldest", () => {
    const reports = toProblemReports(
      [row("photo-n", "report-undated", null), NEWEST],
      new Set(["photo-n", "photo-a"]),
    );

    expect(reports.map((r) => r.reportUuid)).toEqual([
      "report-newest",
      "report-undated",
    ]);
  });

  it("returns nothing when no photo is unresolved", () => {
    expect(toProblemReports([], all)).toEqual([]);
  });
});
