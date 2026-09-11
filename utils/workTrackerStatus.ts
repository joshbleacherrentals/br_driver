/**
 * `WorkTrackers.status` — the trip lifecycle.
 *
 * The full set comes from the Postgres `worktracker_status` enum in
 * `database.types.ts`:
 *
 *   draft → released → accepted → dest_pickup → pickup_inspection →
 *   dest_dropoff → dropoff_inspection → completed, plus `cancelled`.
 *
 * For the photo edit boundary, only `completed` is terminal. `cancelled` trips
 * stay editable/repairable by product decision — a cancelled trip's inspection
 * photos can still be fixed up by the driver. Every other value (including
 * `cancelled`) is treated as a stage the driver is still working through.
 */

import type { WorkTrackerKind } from "@/utils/workTrackerKind";

/** Terminal trip states — nothing about the trip changes after these. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["completed"]);

/**
 * Whether the trip is finished in a way that closes off edits.
 *
 * Used as an edit boundary: work attached to a closed trip (an inspection's
 * photos, say) may still finish *uploading*, but its content is no longer the
 * driver's to change. An unknown/null status is treated as open — a trip we
 * cannot classify is not evidence that it closed. `cancelled` is also treated
 * as open: a cancelled trip must remain editable/repairable.
 */
export function isWorkTrackerClosed(
  status: string | null | undefined,
): boolean {
  return !!status && CLOSED_STATUSES.has(status);
}

/**
 * Statuses the trip passes through once a driver has taken it on — acceptance
 * and everything downstream of it, `completed` included.
 *
 * `cancelled` is absent deliberately, and this is where the two boundaries in
 * this file part ways: `isWorkTrackerClosed` keeps a cancelled trip open so
 * its photos stay repairable, while acceptance treats it as shut because there
 * is no longer a trip to act on.
 */
const ACCEPTED_STATUSES: ReadonlySet<string> = new Set([
  "accepted",
  "dest_pickup",
  "pickup_inspection",
  "dest_dropoff",
  "dropoff_inspection",
  "completed",
]);

/**
 * Whether the driver has taken this trip on.
 *
 * Gates driver-visible contact details: a trip's contact is a customer's
 * personal phone number, shown only on a trip that is actually the driver's.
 * `released` — the pending-trips state — is therefore shut.
 *
 * `accepted_at` is a second, independent witness. Status and timestamp are
 * written by different paths, and the timestamp is the harder evidence that
 * acceptance happened, so it opens the gate on its own — except on a cancelled
 * trip, where cancellation is the later fact and wins.
 */
export function isTripAccepted(
  status: string | null | undefined,
  acceptedAt: string | null | undefined,
): boolean {
  if (status === "cancelled") return false;
  if (acceptedAt) return true;

  return !!status && ACCEPTED_STATUSES.has(status);
}

/**
 * Where a tracker goes when the driver starts it.
 *
 * A trip starts at its pick up. A repair or a site visit has no pick-up leg at
 * all — one place, one arrival, one inspection — so it starts on the leg the
 * office actually filled in, and passes through exactly the same statuses from
 * there: `dest_dropoff` → `dropoff_inspection` → `completed`.
 */
export function startingStatusFor(
  kind: WorkTrackerKind,
): "dest_pickup" | "dest_dropoff" {
  return kind === "trip" ? "dest_pickup" : "dest_dropoff";
}
