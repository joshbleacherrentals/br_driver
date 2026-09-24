/**
 * Picks a history trip's details: the server's snapshot, or the live rows.
 *
 * All or nothing, never merged field by field. With a snapshot the live rows
 * are gone or about to be (they stop syncing once the trip finishes), and the
 * snapshot is the office's latest word. Without one — a trip finished on this
 * phone while offline — the live rows are still on the device, and the sync
 * that brings the snapshot is the same one that removes them.
 */

import type { TripHistorySnapshot } from "./parseHistoryJson";

export function resolveTripHistoryDetails(
  snapshot: TripHistorySnapshot | null,
  live: TripHistorySnapshot,
): TripHistorySnapshot {
  return snapshot ?? live;
}
