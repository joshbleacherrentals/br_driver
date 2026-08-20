/**
 * The counting rules behind "Uploading photos — X of Y".
 *
 * Two of them are easy to get wrong in ways that only show up on a real
 * device weeks later, so they are pinned here:
 *
 * 1. Y is the *current batch*, not everything the driver owns. A long-lived
 *    unresolved report whose photos landed weeks ago must not sit in the
 *    denominator forever.
 * 2. A parked row (§12) is not in flight. Its local file is gone, so no amount
 *    of waiting uploads it, and counting it would pin the banner open on a
 *    photo only the driver can fix.
 */

import {
  deriveUploadActivity,
  EMPTY_UPLOAD_ACTIVITY,
  isUploadInFlight,
  isUnresolvedUploadStatus,
  type UploadActivityRow,
} from "@/library/photoUploadQueue/uploadActivity";
import { MISSING_LOCAL_FILE_ERROR } from "@/library/photoUploadQueue/types";

function row(
  photo_id: string,
  report_uuid: string,
  upload_status: string | null,
  last_error: string | null = null,
): UploadActivityRow {
  return {
    photo_id,
    report_uuid,
    report_created_at: "2026-08-01T00:00:00.000Z",
    upload_status,
    last_error,
  };
}

describe("isUploadInFlight", () => {
  it("treats a photo the queue has never touched as pending", () => {
    expect(isUploadInFlight(row("p", "r", null))).toBe(true);
  });

  it("counts pending and the legacy mid-attempt reservation", () => {
    expect(isUploadInFlight(row("p", "r", "pending"))).toBe(true);
    expect(isUploadInFlight(row("p", "r", "uploading"))).toBe(true);
  });

  it("counts a plain failure — §5, a failed attempt is never a give-up", () => {
    expect(isUploadInFlight(row("p", "r", "failed", "network timeout"))).toBe(
      true,
    );
  });

  it("does not count a parked row: waiting will never fix a missing file", () => {
    expect(
      isUploadInFlight(row("p", "r", "failed", MISSING_LOCAL_FILE_ERROR)),
    ).toBe(false);
  });

  it("does not count a confirmed upload", () => {
    expect(isUploadInFlight(row("p", "r", "uploaded"))).toBe(false);
  });
});

describe("isUnresolvedUploadStatus", () => {
  it("admits exactly what the old SQL-side filter admitted", () => {
    expect(isUnresolvedUploadStatus(null)).toBe(true);
    expect(isUnresolvedUploadStatus("pending")).toBe(true);
    expect(isUnresolvedUploadStatus("failed")).toBe(true);
    expect(isUnresolvedUploadStatus("uploading")).toBe(false);
    expect(isUnresolvedUploadStatus("uploaded")).toBe(false);
  });
});

describe("deriveUploadActivity", () => {
  it("reports nothing at all when no photo is in flight", () => {
    expect(deriveUploadActivity([])).toEqual(EMPTY_UPLOAD_ACTIVITY);
    expect(
      deriveUploadActivity([
        row("a", "r1", "uploaded"),
        row("b", "r1", "uploaded"),
      ]),
    ).toEqual(EMPTY_UPLOAD_ACTIVITY);
  });

  it("counts a busy report's photos, landed and not", () => {
    expect(
      deriveUploadActivity([
        row("a", "r1", "uploaded"),
        row("b", "r1", "pending"),
        row("c", "r1", null),
      ]),
    ).toEqual({ total: 3, uploaded: 1, inFlight: 2 });
  });

  it("leaves a finished report out of the denominator entirely", () => {
    // The shape that used to read "38 of 40": an old, fully-uploaded report
    // sitting unresolved alongside a fresh two-photo submit.
    const rows = [
      row("old-1", "old", "uploaded"),
      row("old-2", "old", "uploaded"),
      row("old-3", "old", "uploaded"),
      row("new-1", "new", "pending"),
      row("new-2", "new", "pending"),
    ];

    expect(deriveUploadActivity(rows)).toEqual({
      total: 2,
      uploaded: 0,
      inFlight: 2,
    });
  });

  it("adds up across several simultaneously busy reports", () => {
    expect(
      deriveUploadActivity([
        row("a", "r1", "uploaded"),
        row("b", "r1", "pending"),
        row("c", "r2", "failed", "http 500"),
      ]),
    ).toEqual({ total: 3, uploaded: 1, inFlight: 2 });
  });

  it("does not make a report busy on the strength of a parked photo alone", () => {
    // The parked photo is the failed banner's business. Progress must not claim
    // an upload is under way when nothing is going to happen.
    expect(
      deriveUploadActivity([
        row("a", "r1", "uploaded"),
        row("b", "r1", "failed", MISSING_LOCAL_FILE_ERROR),
      ]),
    ).toEqual(EMPTY_UPLOAD_ACTIVITY);
  });

  it("still counts a parked photo in the total once its report is busy again", () => {
    // A replacement photo re-opens the report, and the bar should read "1 of 3"
    // rather than pretending the parked one does not exist.
    expect(
      deriveUploadActivity([
        row("a", "r1", "uploaded"),
        row("b", "r1", "failed", MISSING_LOCAL_FILE_ERROR),
        row("c", "r1", "pending"),
      ]),
    ).toEqual({ total: 3, uploaded: 1, inFlight: 1 });
  });
});
