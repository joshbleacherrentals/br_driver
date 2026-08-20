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
export function isWorkTrackerClosed(status: string | null | undefined): boolean {
  return !!status && CLOSED_STATUSES.has(status);
}
