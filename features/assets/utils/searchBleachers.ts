/**
 * Narrow the fleet to what the driver typed, best answer first.
 *
 * A driver looking at a trailer types the number painted on it, so an exact
 * match is never a coincidence and always goes to the top; a prefix ("21" →
 * #212) is the next most likely; a bare substring ("12" → #212) is a fallback
 * that would otherwise bury the bleacher they were actually standing next to.
 */

import type { AssetListRow } from "./bleacherAssetView";

/** Lower is better. Ranks are stable within themselves — fleet order wins ties. */
const EXACT = 0;
const PREFIX = 1;
const CONTAINS = 2;
const NO_MATCH = 3;

function rank(bleacherNumber: string | null, needle: string): number {
  if (!bleacherNumber) return NO_MATCH;
  const candidate = bleacherNumber.trim().toLowerCase();
  if (candidate === needle) return EXACT;
  if (candidate.startsWith(needle)) return PREFIX;
  if (candidate.includes(needle)) return CONTAINS;
  return NO_MATCH;
}

export function searchBleachers(
  rows: AssetListRow[],
  query: string,
): AssetListRow[] {
  // A driver types what is painted on the trailer, hash and all.
  const needle = query.trim().replace(/^#+/, "").trim().toLowerCase();
  if (!needle) return rows;

  return rows
    .map((row, index) => ({
      row,
      index,
      rank: rank(row.bleacherNumber, needle),
    }))
    .filter((scored) => scored.rank !== NO_MATCH)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((scored) => scored.row);
}
