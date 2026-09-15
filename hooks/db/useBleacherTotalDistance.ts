/**
 * How far this bleacher has been hauled.
 *
 * Summed from the driver's own work trackers, because those are the only ones
 * on the phone: `WorkTrackers` syncs scoped to the signed-in driver (see the
 * mobile stream in br_powersync/config/sync_rules.yaml), so this is this
 * driver's mileage with this bleacher, not the fleet's. The web app computes
 * the same sum over every tracker and will therefore report a larger number.
 *
 * Both the assigned bleacher and the one the driver actually took are counted
 * — a swapped leg was still hauled — which is what `getEffectiveBleacherUuid`
 * means everywhere else in the app.
 */

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

type DistanceRow = {
  distance_meters: number | null;
  bleacher_uuid: string | null;
  actual_bleacher_uuid: string | null;
};

export function useBleacherTotalDistance(
  bleacherId: string | null,
): number | null {
  const compiled = useMemo(() => {
    if (!bleacherId) return null;

    return db
      .selectFrom("WorkTrackers")
      .select(["distance_meters", "bleacher_uuid", "actual_bleacher_uuid"])
      .where((eb) =>
        eb.or([
          eb("actual_bleacher_uuid", "=", bleacherId),
          eb.and([
            eb("actual_bleacher_uuid", "is", null),
            eb("bleacher_uuid", "=", bleacherId),
          ]),
        ]),
      )
      .compile();
  }, [bleacherId]);

  const result = useTypedQuery(compiled, expect<DistanceRow>());

  return useMemo(() => {
    if (!bleacherId) return null;
    const rows = result.data ?? [];
    return rows.reduce((total, row) => total + (row.distance_meters ?? 0), 0);
  }, [bleacherId, result.data]);
}
