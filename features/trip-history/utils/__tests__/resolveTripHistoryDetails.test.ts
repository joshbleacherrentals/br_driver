/**
 * Where a history trip's details come from (docs/specs/sync-bucket-limit.md §7).
 *
 * The snapshot, when the server has written one. Otherwise the live rows:
 * a trip finished on this phone while offline has no snapshot yet, but its
 * addresses, line items and inspections are still on the device until the
 * next sync — which delivers the snapshot and removes them in one checkpoint.
 */

import type { TripHistorySnapshot } from "@/features/trip-history/utils/parseHistoryJson";
import { resolveTripHistoryDetails } from "@/features/trip-history/utils/resolveTripHistoryDetails";

const live: TripHistorySnapshot = {
  pickupAddress: { street: "1 Live St", city: "Calgary", state_province: "AB" },
  dropoffAddress: null,
  lineItems: [
    {
      id: "li-live",
      work_tracker_uuid: "trip-1",
      type: "hauling",
      qty_decimal: 10,
      unit_amt_cents: 300,
      description: "live",
      is_automatically_managed: 1,
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  preInspection: null,
  postInspection: null,
};

const snapshot: TripHistorySnapshot = {
  pickupAddress: { street: "2 Snapshot Ave, Calgary, AB" },
  dropoffAddress: { street: "3 Snapshot Rd, Edmonton, AB" },
  lineItems: [],
  preInspection: {
    id: "insp",
    created_at: null,
    walk_around_complete: 1,
    issues_found: 0,
    issue_description: null,
    answers_json: null,
    bleacher_uuid: null,
  },
  postInspection: null,
};

describe("resolveTripHistoryDetails", () => {
  it("uses the snapshot whole when there is one, even where it is emptier than live", () => {
    expect(resolveTripHistoryDetails(snapshot, live)).toEqual(snapshot);
  });

  it("falls back to the live rows while the trip has no snapshot yet", () => {
    expect(resolveTripHistoryDetails(null, live)).toEqual(live);
  });
});
