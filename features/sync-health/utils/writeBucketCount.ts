import { db } from "@/library/powersync/db";
import { MOBILE_CONNECT_PARAMS } from "@/library/powersync/connectParams";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

/**
 * Records this device's bucket count on the driver's own Drivers row.
 *
 * A local write like any other: PowerSync uploads it when there is network,
 * so a report measured offline still arrives, stamped with when it was taken.
 */
export async function writeBucketCount(
  driverId: string,
  bucketCount: number,
  now: Date,
): Promise<void> {
  await executeTypedMutationVoid(
    db
      .updateTable("Drivers")
      .set({
        bucket_count: bucketCount,
        sync_version: MOBILE_CONNECT_PARAMS.sync_version,
        bucket_count_reported_at: now.toISOString(),
      })
      .where("id", "=", driverId)
      .compile(),
  );
}
