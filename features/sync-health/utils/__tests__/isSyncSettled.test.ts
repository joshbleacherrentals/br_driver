/**
 * "The app finished a successful sync" — the moment the bucket count is
 * worth reading.
 *
 * Before the first complete sync the device holds only part of its buckets,
 * and mid-download the number is still moving, so neither is reported. An
 * errored download is not a success either.
 */

import { isSyncSettled } from "../isSyncSettled";

const settled = {
  connected: true,
  hasSynced: true,
  dataFlowStatus: { downloading: false, downloadError: undefined },
};

describe("isSyncSettled", () => {
  it("is true when connected, synced at least once, and idle", () => {
    expect(isSyncSettled(settled)).toBe(true);
  });

  it("is false before the first complete sync", () => {
    expect(isSyncSettled({ ...settled, hasSynced: false })).toBe(false);
    expect(isSyncSettled({ ...settled, hasSynced: undefined })).toBe(false);
  });

  it("is false while still downloading", () => {
    expect(
      isSyncSettled({ ...settled, dataFlowStatus: { downloading: true } }),
    ).toBe(false);
  });

  it("is false while disconnected — offline counts are not re-reported", () => {
    expect(isSyncSettled({ ...settled, connected: false })).toBe(false);
  });

  it("is false when the last download failed", () => {
    expect(
      isSyncSettled({
        ...settled,
        dataFlowStatus: {
          downloading: false,
          downloadError: new Error("PSYNC_S2305"),
        },
      }),
    ).toBe(false);
  });

  it("is false for a missing status", () => {
    expect(isSyncSettled(undefined)).toBe(false);
  });
});
