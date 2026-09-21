import { isBucketReportDue, type LastBucketReport } from "./isBucketReportDue";

type ReporterDeps = {
  read: () => Promise<number>;
  write: (driverId: string, bucketCount: number, now: Date) => Promise<void>;
  now: () => number;
  onError: (error: unknown) => void;
};

export type BucketCountReporter = {
  onSyncSettled: (driverId: string) => Promise<void>;
};

/**
 * Decides, on each finished sync, whether to measure and write the count.
 *
 * Holds this launch's last report in memory: the first finished sync reports,
 * then at most one report per interval (see `isBucketReportDue`). Overlapping
 * calls share one in-flight report. Failures go to `onError` and are not
 * recorded, so the next finished sync retries.
 */
export function createBucketCountReporter(deps: ReporterDeps): BucketCountReporter {
  let last: LastBucketReport | null = null;
  let inFlight: Promise<void> | null = null;

  async function report(driverId: string): Promise<void> {
    const atMs = deps.now();
    try {
      const count = await deps.read();
      await deps.write(driverId, count, new Date(atMs));
      last = { driverId, atMs };
    } catch (error) {
      deps.onError(error);
    }
  }

  return {
    onSyncSettled(driverId) {
      if (inFlight) return inFlight;
      if (!isBucketReportDue(last, driverId, deps.now())) return Promise.resolve();
      inFlight = report(driverId).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
