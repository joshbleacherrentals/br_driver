/**
 * The reporter decides, on every finished sync, whether to measure and write.
 *
 * It exists as a plain object (not inside the hook) because the properties
 * that matter are about sequences of events:
 *
 *  * the first finished sync of a launch reports; the next ones within six
 *    hours do not — the report's own upload causes another finished sync, so
 *    without this the report would feed itself;
 *  * sync events arrive in bursts; two in flight at once must not write twice;
 *  * a failed read or write is swallowed (reporting must never break the app)
 *    and is NOT counted as a report, so the next finished sync tries again.
 */

import { createBucketCountReporter } from "../bucketCountReporter";

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-09-21T12:00:00Z");

function setup(options: { count?: number } = {}) {
  let nowMs = START;
  const read = jest.fn(async () => options.count ?? 143);
  const write = jest.fn(
    async (_driverId: string, _count: number, _now: Date) => undefined,
  );
  const onError = jest.fn();
  const reporter = createBucketCountReporter({
    read,
    write,
    now: () => nowMs,
    onError,
  });
  return {
    reporter,
    read,
    write,
    onError,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("createBucketCountReporter", () => {
  it("reports on the first finished sync of the launch", async () => {
    const { reporter, write } = setup({ count: 412 });
    await reporter.onSyncSettled("driver-a");

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("driver-a", 412, new Date(START));
  });

  it("does not report again on the next sync within six hours", async () => {
    const { reporter, read, write, advance } = setup();
    await reporter.onSyncSettled("driver-a");
    advance(5 * HOUR);
    await reporter.onSyncSettled("driver-a");

    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("reports again once six hours have passed", async () => {
    const { reporter, write, advance } = setup();
    await reporter.onSyncSettled("driver-a");
    advance(6 * HOUR);
    await reporter.onSyncSettled("driver-a");

    expect(write).toHaveBeenCalledTimes(2);
  });

  it("writes once when two finished syncs overlap", async () => {
    const { reporter, write } = setup();
    await Promise.all([
      reporter.onSyncSettled("driver-a"),
      reporter.onSyncSettled("driver-a"),
    ]);

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("does not write when the count cannot be read, and retries next sync", async () => {
    const { reporter, read, write, onError } = setup();
    read.mockRejectedValueOnce(new Error("locked"));

    await expect(reporter.onSyncSettled("driver-a")).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    await reporter.onSyncSettled("driver-a");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("does not count a failed write as a report", async () => {
    const { reporter, write, onError } = setup();
    write.mockRejectedValueOnce(new Error("disk full"));

    await expect(reporter.onSyncSettled("driver-a")).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);

    await reporter.onSyncSettled("driver-a");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("reports at once for a different driver signing in on the same device", async () => {
    const { reporter, write } = setup();
    await reporter.onSyncSettled("driver-a");
    await reporter.onSyncSettled("driver-b");

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toBe("driver-b");
  });
});
