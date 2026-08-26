/**
 * How long a driver may still change what they filed.
 *
 * The product rule is 24 hours; the Postgres policy allows 48. The gap is not
 * sloppiness, it is the offline-first tax: an edit made at 23h59m on a phone in
 * a dead zone may not reach Supabase for days, and a policy measured against
 * the server's clock would reject it on arrival — which PowerSync treats as a
 * fatal, non-retryable error and drops. The extra 24 hours server-side is the
 * slack that keeps a legitimate offline edit from being silently discarded.
 *
 * So: this module decides what the UI offers, never what the database permits.
 */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** The product rule. The server's own window is twice this — see the header. */
export const EDIT_WINDOW_MS = 24 * HOUR_MS;

/**
 * `created_at` as a timestamp, or `null` if it is missing or unparsable.
 *
 * Both cases are real: a row can arrive from Postgres with a null the schema
 * permits, and `Date.parse` answers `NaN` rather than throwing for junk.
 */
function parseCreatedAt(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Milliseconds of edit window left, clamped to `[0, EDIT_WINDOW_MS]`.
 *
 * A `created_at` in the future (a phone whose clock runs fast) clamps to the
 * full window rather than overflowing it — the driver gets their day, not more.
 * An unusable `created_at` yields `0`, so the caller shows no countdown.
 */
export function editWindowMsLeft(
  createdAt: string | null | undefined,
  now: number,
): number {
  const created = parseCreatedAt(createdAt);
  if (created === null) return 0;

  const left = created + EDIT_WINDOW_MS - now;
  if (left <= 0) return 0;
  return Math.min(left, EDIT_WINDOW_MS);
}

/**
 * Whether the Edit and Delete affordances should be offered at all.
 *
 * Closed for a ticket whose `created_at` cannot be trusted: the window cannot
 * be proven open, and offering an edit the server may refuse is worse than
 * offering nothing.
 */
export function canEditTicket(
  createdAt: string | null | undefined,
  now: number,
): boolean {
  return editWindowMsLeft(createdAt, now) > 0;
}

/**
 * The countdown a card shows while the window is open — `"18h left"`,
 * `"42m left"` — or `null` once there is nothing to show.
 *
 * Hours round down (18h59m reads as "18h left": promising less than is left is
 * the safe direction), but the last minute rounds *up* to `"1m left"` rather
 * than down to `"0m left"`, which would read as expired while Edit still works.
 */
export function formatEditWindowLeft(msLeft: number): string | null {
  if (msLeft <= 0) return null;
  if (msLeft >= HOUR_MS) return `${Math.floor(msLeft / HOUR_MS)}h left`;
  return `${Math.max(1, Math.floor(msLeft / MINUTE_MS))}m left`;
}
