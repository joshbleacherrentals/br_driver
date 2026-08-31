/**
 * Ordering for the bleacher picker a driver sees when confirming which trailer
 * they actually hooked up.
 *
 * The fleet runs to hundreds of units, so an alphabetical list is useless at the
 * warehouse. A driver only ever swaps for something standing nearby, so the
 * realistic candidates — same warehouse, then same zone — come first, and search
 * covers the rest.
 */

/** Only the columns the ordering reads. `BleacherData` satisfies this. */
export type OrderableBleacher = {
  id: string;
  bleacher_number: string | null;
  zone_uuid: string | null;
  storage_location_uuid: string | null;
  deleted: number | null;
};

export type BleacherGroup =
  | "assigned"
  | "same_location"
  | "same_zone"
  | "other";

export type OrderedBleacher<T extends OrderableBleacher> = T & {
  group: BleacherGroup;
};

const GROUP_RANK: Record<BleacherGroup, number> = {
  assigned: 0,
  same_location: 1,
  same_zone: 2,
  other: 3,
};

/**
 * Numeric rank for a bleacher number held as text. Unnumbered units sort last
 * rather than as zero, which would float them to the top.
 */
function numberRank(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/** Two ids match only when both are known — null is "unknown", not a match. */
function sameKey(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

export function orderBleacherOptions<T extends OrderableBleacher>(
  bleachers: T[],
  assigned: OrderableBleacher | null,
): OrderedBleacher<T>[] {
  return bleachers
    .filter((b) => b.deleted !== 1 || b.id === assigned?.id)
    .map((b) => ({ ...b, group: groupOf(b, assigned) }))
    .sort(
      (a, b) =>
        GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
        numberRank(a.bleacher_number) - numberRank(b.bleacher_number) ||
        (a.bleacher_number ?? "").localeCompare(b.bleacher_number ?? ""),
    );
}

function groupOf(
  bleacher: OrderableBleacher,
  assigned: OrderableBleacher | null,
): BleacherGroup {
  if (!assigned) return "other";
  if (bleacher.id === assigned.id) return "assigned";
  if (sameKey(bleacher.storage_location_uuid, assigned.storage_location_uuid))
    return "same_location";
  if (sameKey(bleacher.zone_uuid, assigned.zone_uuid)) return "same_zone";
  return "other";
}
