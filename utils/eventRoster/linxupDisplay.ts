/**
 * How the Live Location screen writes a tracker's numbers.
 */

import { formatSinceChange } from "@/utils/eventRoster/describeFleetStatus";

/** "5 min ago" — the roster's own phrasing; a reading from the future is "just now". */
export function formatLastUpdated(
  updatedAtMs: number | undefined,
  now: number,
): string | null {
  if (updatedAtMs === undefined) return null;
  return formatSinceChange(new Date(updatedAtMs).toISOString(), now);
}

/** Six decimals (~10 cm), like the web card. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

/**
 * The web labels this km/h. Unverified: Linxup is a US service and may send
 * mph — check against a unit in motion before relying on the number.
 */
export function formatSpeed(speed: number | undefined): string {
  return speed === undefined ? "N/A" : `${speed} km/h`;
}
