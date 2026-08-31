/**
 * Three tickets per driver per rolling 24 hours.
 *
 * Enforced twice, with the same number in both places: here, and by a Postgres
 * trigger. The symmetry is the point. PowerSync classifies a constraint
 * violation as fatal (`FATAL_RESPONSE_CODES`, BackendConnector.ts), so a write
 * the client allows and the server rejects is dropped from the outbox without a
 * word — the driver would keep a ticket that exists on no one else's machine.
 * The client must therefore never be the more permissive of the two.
 *
 * That is also why a withdrawn ticket keeps its slot. The trigger counts rows
 * created, not rows surviving; if the app discounted soft-deleted ones it would
 * hand out a fourth slot the server refuses, and "create, delete, repeat" would
 * be an unmetered channel besides. Soft-deleted rows keep syncing to the device
 * precisely so this count can see them (see `RoadmapTasksCols` in AppSchema).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Must match the Postgres trigger on `RoadmapTasks`. */
export const DAILY_TICKET_LIMIT = 3;

/**
 * How many of `createdAts` fall inside the last 24 hours.
 *
 * Rolling, not calendar-day: a driver who files three at 23:50 does not get
 * three more ten minutes later. Rows whose `created_at` is missing or
 * unparsable are skipped rather than thrown on — one malformed row must not
 * take the create button down.
 */
export function countTicketsInWindow(
  createdAts: readonly (string | null | undefined)[],
  now: number,
): number {
  const cutoff = now - DAY_MS;
  let count = 0;

  for (const createdAt of createdAts) {
    if (!createdAt) continue;
    const ms = Date.parse(createdAt);
    if (Number.isNaN(ms)) continue;
    if (ms > cutoff) count += 1;
  }

  return count;
}

/** Whether the driver has a slot left right now. */
export function canCreateTicket(
  createdAts: readonly (string | null | undefined)[],
  now: number,
): boolean {
  return countTicketsInWindow(createdAts, now) < DAILY_TICKET_LIMIT;
}

/**
 * When the next slot frees, or `null` if one is already free.
 *
 * That moment is 24 hours after the *oldest* ticket still inside the window —
 * the instant the count drops below the limit — and it is what the disabled
 * create button promises the driver.
 */
export function nextTicketSlotAt(
  createdAts: readonly (string | null | undefined)[],
  now: number,
): number | null {
  if (canCreateTicket(createdAts, now)) return null;

  const cutoff = now - DAY_MS;
  let oldest: number | null = null;

  for (const createdAt of createdAts) {
    if (!createdAt) continue;
    const ms = Date.parse(createdAt);
    if (Number.isNaN(ms) || ms <= cutoff) continue;
    if (oldest === null || ms < oldest) oldest = ms;
  }

  return oldest === null ? null : oldest + DAY_MS;
}
