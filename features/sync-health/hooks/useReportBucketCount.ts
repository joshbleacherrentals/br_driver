import { DebugLogger } from "@/library/debug/DebugLogger";
import { powerSyncDb } from "@/library/powersync/db";
import { useEffect } from "react";
import { createBucketCountReporter } from "../utils/bucketCountReporter";
import { isSyncSettled } from "../utils/isSyncSettled";
import { readBucketCount } from "../utils/readBucketCount";
import { writeBucketCount } from "../utils/writeBucketCount";

const TAG = "SyncHealth";

// Module scope on purpose: one reporter per app launch, so a remount of the
// component using this hook does not reset the six-hour throttle.
const reporter = createBucketCountReporter({
  read: () => readBucketCount(powerSyncDb),
  write: writeBucketCount,
  now: Date.now,
  onError: (error) =>
    DebugLogger.warn(TAG, "Failed to report bucket count", {
      error: error instanceof Error ? error.message : String(error),
    }),
});

/**
 * Reports how many PowerSync buckets this device holds onto the driver's own
 * Drivers row, after a successful sync (see docs/specs/sync-bucket-limit.md).
 * Developers read it on the web Sync Health page.
 */
export function useReportBucketCount(driverId: string | null | undefined) {
  useEffect(() => {
    if (!driverId) return;

    const onStatus = (status: Parameters<typeof isSyncSettled>[0]) => {
      if (isSyncSettled(status)) void reporter.onSyncSettled(driverId);
    };

    // The first sync may already have finished before this mounted.
    onStatus(powerSyncDb.currentStatus);
    return powerSyncDb.registerListener({ statusChanged: onStatus });
  }, [driverId]);
}
