/**
 * A history trip's addresses, line items and inspections — from its snapshot,
 * or from the live rows while it has none yet (see resolveTripHistoryDetails).
 *
 * The live hooks always run (hooks can't be conditional) but are handed null
 * ids once a snapshot exists, so they query nothing.
 */

import { useMemo } from "react";

import { useAddress } from "@/hooks/db/useAddress";
import { useInspection } from "@/hooks/db/useInspection";
import { useWorkTrackerLineItems } from "@/hooks/db/useWorkTrackerLineItems";
import type { WorkTracker } from "@/hooks/db/useWorkTrackers";

import { parseHistoryJson, type TripHistorySnapshot } from "../utils/parseHistoryJson";
import { resolveTripHistoryDetails } from "../utils/resolveTripHistoryDetails";

export function useTripHistoryDetails(
  workTracker: Pick<
    WorkTracker,
    | "id"
    | "history_json"
    | "pickup_address_uuid"
    | "dropoff_address_uuid"
    | "pre_inspection_uuid"
    | "post_inspection_uuid"
  >,
): TripHistorySnapshot {
  const snapshot = useMemo(
    () => parseHistoryJson(workTracker.history_json, workTracker.id),
    [workTracker.history_json, workTracker.id],
  );
  const live = (id: string | null) => (snapshot ? null : id);

  const { address: pickupAddress } = useAddress(live(workTracker.pickup_address_uuid));
  const { address: dropoffAddress } = useAddress(live(workTracker.dropoff_address_uuid));
  const { inspection: preInspection } = useInspection(live(workTracker.pre_inspection_uuid));
  const { inspection: postInspection } = useInspection(live(workTracker.post_inspection_uuid));
  const { lineItems } = useWorkTrackerLineItems(live(workTracker.id));

  return useMemo(
    () =>
      resolveTripHistoryDetails(snapshot, {
        pickupAddress,
        dropoffAddress,
        lineItems,
        preInspection,
        postInspection,
      }),
    [snapshot, pickupAddress, dropoffAddress, lineItems, preInspection, postInspection],
  );
}
