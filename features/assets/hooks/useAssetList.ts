/**
 * The Assets list: every bleacher in the fleet, narrowed to what was typed.
 *
 * One hook rather than a query plus a filter at the call site, because the
 * order of the three steps matters and is easy to get wrong: retire the
 * deleted rows, resolve the names, *then* search. Searching before resolving
 * would leave a driver unable to find a bleacher by anything but its number,
 * which is the only thing the list is for.
 */

import { useFleetReference } from "@/hooks/db/useFleetReference";
import { useAllBleachers } from "@/hooks/db/useBleacher";
import { useMemo } from "react";

import { toAssetListRow, type AssetListRow } from "../utils/bleacherAssetView";
import { searchBleachers } from "../utils/searchBleachers";

export function useAssetList(query: string): {
  rows: AssetListRow[];
  /** The fleet before the search ran — how the empty state tells the two cases apart. */
  fleetSize: number;
} {
  const { bleachers } = useAllBleachers();
  const lookups = useFleetReference();

  const rows = useMemo(
    () =>
      bleachers
        // A retired bleacher is not an asset a driver can be standing next to.
        .filter((bleacher) => bleacher.deleted !== 1)
        .map((bleacher) => toAssetListRow(bleacher, lookups)),
    [bleachers, lookups],
  );

  const filtered = useMemo(() => searchBleachers(rows, query), [rows, query]);

  return { rows: filtered, fleetSize: rows.length };
}
