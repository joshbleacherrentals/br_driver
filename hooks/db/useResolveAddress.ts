import { db } from '@/components/providers/SystemProvider';
import { BleacherData } from '@/hooks/db/useBleacher';
import { useDropoffsByBleachers } from '@/hooks/db/useWorkTrackers';
import { expect, useTypedQuery } from '@/library/powersync/typedQuery';
import { useMemo } from 'react';

function getSeasonHomeBaseUuid(bleacher: BleacherData): string | null {
  const month = new Date().getMonth() + 1;
  const isWinter = month >= 10 || month <= 3;
  if (isWinter) {
    return bleacher.winter_home_base_uuid ?? bleacher.summer_home_base_uuid ?? null;
  }
  return bleacher.summer_home_base_uuid ?? bleacher.winter_home_base_uuid ?? null;
}

type AddressRow = {
  id: string;
  street: string | null;
};

export function useResolvedBleacherAddresses(
  bleachers: BleacherData[],
  targetDate: string,
): Record<string, string | null> {
  const bleacherIds = useMemo(
    () => bleachers.map((b) => b.id).filter(Boolean),
    [bleachers]
  );

  // ── Step 1: last known dropoff WorkTracker per bleacher ───────────────────
  const { rows } = useDropoffsByBleachers(bleacherIds, targetDate);

  // ── Step 2: first row per bleacher is the most recent (ordered desc) ──────
  const wtMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    rows.forEach((row) => {
      if (!row.bleacher_uuid) return;
      if (!(row.bleacher_uuid in map)) {
        map[row.bleacher_uuid] = row.dropoff_address_uuid;
      }
    });
    return map;
  }, [rows]);


  // ── Step 3: fall back to seasonal home base for bleachers with no history ──
  const addressUuidMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    bleachers.forEach((b) => {
      map[b.id] = b.id in wtMap ? wtMap[b.id] : getSeasonHomeBaseUuid(b);
    });
    return map;
  }, [bleachers, wtMap]);

  // ── Step 4: batch fetch address streets ──────────────────────────────────
  const uniqueAddressUuids = useMemo(
    () =>
      Array.from(
        new Set(Object.values(addressUuidMap).filter((id): id is string => id !== null))
      ),
    [addressUuidMap]
  );

  const addrQuery = useMemo(() => {
    if (uniqueAddressUuids.length === 0) return null;
    return db
      .selectFrom('Addresses')
      .select(['id', 'street'])
      .where('id', 'in', uniqueAddressUuids)
      .compile();
  }, [uniqueAddressUuids]);

  const addrResult = useTypedQuery(addrQuery, expect<AddressRow>());

  const addressStreetMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    addrResult.data?.forEach((row) => {
      map[row.id] = row.street;
    });
    return map;
  }, [addrResult.data]);

  // ── Step 5: bleacher id → street ─────────────────────────────────────────
  return useMemo(() => {
    const result: Record<string, string | null> = {};
    bleachers.forEach((b) => {
      const addrUuid = addressUuidMap[b.id];
      result[b.id] = addrUuid ? (addressStreetMap[addrUuid] ?? null) : null;
    });
    return result;
  }, [bleachers, addressUuidMap, addressStreetMap]);
}