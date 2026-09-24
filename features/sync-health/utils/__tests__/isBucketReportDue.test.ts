/**
 * When the app may write its bucket count again.
 *
 * Every write is a row in the PowerSync upload queue, and the write itself
 * causes a new checkpoint — which ends in another "sync finished" event. With
 * no throttle, reporting would feed itself. The rule is: once per app launch
 * (the first finished sync), then at most every six hours while the app stays
 * open, because drivers leave it running for days.
 */

import {
  BUCKET_REPORT_INTERVAL_MS,
  isBucketReportDue,
} from "../isBucketReportDue";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const HOUR = 60 * 60 * 1000;

describe("isBucketReportDue", () => {
  it("the interval is six hours", () => {
    expect(BUCKET_REPORT_INTERVAL_MS).toBe(6 * HOUR);
  });

  it("is due when this launch has not reported yet", () => {
    expect(isBucketReportDue(null, "driver-a", NOW)).toBe(true);
  });

  it("is not due again right after a report", () => {
    expect(
      isBucketReportDue({ driverId: "driver-a", atMs: NOW }, "driver-a", NOW),
    ).toBe(false);
  });

  it("is not due one millisecond before six hours", () => {
    const last = { driverId: "driver-a", atMs: NOW - 6 * HOUR + 1 };
    expect(isBucketReportDue(last, "driver-a", NOW)).toBe(false);
  });

  it("is due at six hours", () => {
    const last = { driverId: "driver-a", atMs: NOW - 6 * HOUR };
    expect(isBucketReportDue(last, "driver-a", NOW)).toBe(true);
  });

  it("is due at once for a different driver on the same device", () => {
    // Sign-out / sign-in as someone else: the last report was not theirs.
    const last = { driverId: "driver-a", atMs: NOW };
    expect(isBucketReportDue(last, "driver-b", NOW)).toBe(true);
  });

  it("is due when the clock went backwards past the last report", () => {
    // A device clock corrected backwards must not silence reporting for hours.
    const last = { driverId: "driver-a", atMs: NOW + 1 * HOUR };
    expect(isBucketReportDue(last, "driver-a", NOW)).toBe(true);
  });
});
