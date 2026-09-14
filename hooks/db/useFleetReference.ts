/**
 * The three small reference tables the Assets page resolves names against.
 *
 * Read as whole tables and handed back as maps, rather than joined into the
 * bleacher query. They are office-maintained catalogues — tens of rows each,
 * changing a few times a year — so the whole set costs less to hold than the
 * re-render a four-table watched query would cause on every unrelated write.
 *
 * Each can be empty on a device whose sync stream has not yet caught up with
 * the rules that added them. That is a first-class state, not an error: the
 * caller falls back (see `toAssetDetail`) rather than blocking.
 */

import { db } from "@/components/providers/SystemProvider";
import type {
  AssetLookups,
  BleacherTypeEntry,
} from "@/features/assets/utils/bleacherAssetView";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

type BleacherTypeRow = {
  id: string;
  name: string | null;
  row_count: number | null;
};
type NamedRow = { id: string; name: string | null };
type ZoneRow = { id: string; display_name: string | null };

const typesQuery = db
  .selectFrom("BleacherTypes")
  .select(["id", "name", "row_count"])
  .compile();

const storageLocationsQuery = db
  .selectFrom("StorageLocations")
  .select(["id", "name"])
  .compile();

const zonesQuery = db
  .selectFrom("Zones")
  .select(["id", "display_name"])
  .compile();

export function useFleetReference(): AssetLookups {
  const types = useTypedQuery(typesQuery, expect<BleacherTypeRow>());
  const storageLocations = useTypedQuery(
    storageLocationsQuery,
    expect<NamedRow>(),
  );
  const zones = useTypedQuery(zonesQuery, expect<ZoneRow>());

  const typeMap = useMemo(() => {
    const map = new Map<string, BleacherTypeEntry>();
    for (const row of types.data ?? []) {
      map.set(row.id, { name: row.name, rowCount: row.row_count });
    }
    return map;
  }, [types.data]);

  const storageLocationMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const row of storageLocations.data ?? []) map.set(row.id, row.name);
    return map;
  }, [storageLocations.data]);

  const zoneMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const row of zones.data ?? []) map.set(row.id, row.display_name);
    return map;
  }, [zones.data]);

  return useMemo(
    () => ({
      types: typeMap,
      storageLocations: storageLocationMap,
      zones: zoneMap,
    }),
    [typeMap, storageLocationMap, zoneMap],
  );
}
