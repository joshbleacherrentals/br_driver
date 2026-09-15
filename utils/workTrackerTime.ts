/**
 * Rendering a work tracker's leg time.
 *
 * The office picks a mode and up to two `time` values per leg:
 *
 *   exact     one time      start = end
 *   flexible  a window      start < end
 *   any_time  unset         start = end = null
 *
 * A Postgres trigger mirrors that choice into the free-text `pickup_time` /
 * `dropoff_time` columns the app used to read. This formatter reproduces that
 * mirror from the structured columns instead, so the driver sees the booked
 * time rather than whatever text happened to be saved last — and matches the
 * mirror character for character, so the two can never look like two different
 * answers.
 *
 * The text column stays as the fallback for rows written before the migration,
 * which have no mode at all.
 */

/** `WorkTrackers.pickup_time_mode` / `dropoff_time_mode`. */
export type WorkTrackerTimeMode = "exact" | "flexible" | "any_time";

export type WorkTrackerLegTime = {
  mode: string | null | undefined;
  start: string | null | undefined;
  end: string | null | undefined;
};

/** What the office means by "no time picked". */
export const ANY_TIME_LABEL = "Any Time";

/**
 * `HH:MM:SS` (Postgres `time`) as a 12-hour clock reading — `to_char(t,
 * 'HH12:MI AM')`, zero-padded hour included. Null for anything that is not a
 * time, so a malformed value degrades to "Any Time" rather than to "NaN:NaN".
 */
function toClockReading(time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;

  const hours24 = Number(match[1]);
  const minutes = match[2];
  if (hours24 > 23 || Number(minutes) > 59) return null;

  const meridiem = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${String(hours12).padStart(2, "0")}:${minutes} ${meridiem}`;
}

/**
 * The leg's time as the driver should read it.
 *
 * `fallbackText` is the row's legacy `pickup_time` / `dropoff_time`, used only
 * when there is no mode to go on.
 */
export function formatWorkTrackerTime(
  leg: WorkTrackerLegTime,
  fallbackText?: string | null,
): string {
  const { mode, start, end } = leg;

  if (mode === "exact" && start) {
    return toClockReading(start) ?? ANY_TIME_LABEL;
  }

  if (mode === "flexible" && start && end) {
    const from = toClockReading(start);
    const to = toClockReading(end);
    if (from && to) return `${from} - ${to}`;
    return ANY_TIME_LABEL;
  }

  if (!mode) {
    return fallbackText?.trim() || ANY_TIME_LABEL;
  }

  return ANY_TIME_LABEL;
}
