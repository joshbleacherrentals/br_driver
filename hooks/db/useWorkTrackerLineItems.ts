import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { lineItemTotalCents } from "@/utils/lineItems";
import { useMemo } from "react";

export type WorkTrackerLineItem = {
  id: string;
  work_tracker_uuid: string | null;
  type: string | null;
  quantity: number | null;
  unit_amt_cents: number | null;
  description: string | null;
  is_automatically_managed: number | null;
  created_at: string | null;
};

/**
 * The pay breakdown behind one work tracker.
 *
 * No `scopedFrom` here: unlike the photo tables, `WorkTrackerLineItems` syncs
 * to a device only through its own `WorkTrackers` row, which the mobile sync
 * rules already join to the signed-in driver. A device never holds another
 * driver's line items, so filtering by `work_tracker_uuid` is the whole scope.
 */
export function useWorkTrackerLineItems(
  workTrackerId: string | null | undefined,
): {
  lineItems: WorkTrackerLineItem[];
  totalCents: number;
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!workTrackerId) return null;

    return db
      .selectFrom("WorkTrackerLineItems")
      .select([
        "id",
        "work_tracker_uuid",
        "type",
        "quantity",
        "unit_amt_cents",
        "description",
        "is_automatically_managed",
        "created_at",
      ])
      .where("work_tracker_uuid", "=", workTrackerId)
      .orderBy("created_at", "asc")
      .compile();
  }, [workTrackerId]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<WorkTrackerLineItem>(),
  );

  const lineItems = useMemo(() => data ?? [], [data]);

  const totalCents = useMemo(
    () => lineItems.reduce((sum, item) => sum + lineItemTotalCents(item), 0),
    [lineItems],
  );

  return { lineItems, totalCents, isLoading };
}
