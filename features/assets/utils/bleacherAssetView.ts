/**
 * The shapes the Assets screens read, with every `*_uuid` already resolved.
 *
 * Nothing above this file knows that a bleacher's type, storage location and
 * zone live in three other tables: the list renders `typeName`, the detail
 * screen renders `zoneName`, and the joining happens once, here.
 *
 * The joins are done in memory rather than in SQL on purpose. The three
 * lookup tables are reference data — tens of rows each, synced whole — and
 * PowerSync re-runs a watched query on any write to any table it touches, so a
 * four-table join would re-render the whole fleet list every time a work
 * tracker changed. Reading them as three small maps keeps the list's own query
 * watching only `Bleachers`.
 */

import type { AnnualInspectionRecord } from "./annualInspectionStatus";

/** The `Bleachers` columns the Assets screens actually read. */
export type BleacherRow = {
  id: string;
  bleacher_number: string | null;
  bleacher_seats: number | null;
  bleacher_rows: number | null;
  bleacher_type_uuid: string | null;
  storage_location_uuid: string | null;
  zone_uuid: string | null;
  manufacturer: string | null;
  vin_number: string | null;
  tag_number: string | null;
  hitch_type: string | null;
  trailer_height_in: number | null;
  trailer_length_in: number | null;
  height_folded_ft: number | null;
  trailer_length: number | null;
  gvwr: number | null;
  opening_direction: string | null;
  nvis_pdf_path: string | null;
};

export type BleacherTypeEntry = {
  name: string | null;
  rowCount: number | null;
};

/**
 * The three reference tables, keyed by id.
 *
 * Every one of them can legitimately be empty: they are new to the mobile
 * sync stream, and a device that has not received them yet must still show
 * the bleacher.
 */
export type AssetLookups = {
  types: ReadonlyMap<string, BleacherTypeEntry>;
  storageLocations: ReadonlyMap<string, string | null>;
  zones: ReadonlyMap<string, string | null>;
};

/** One row of the Assets list — what the driver scans and searches. */
export type AssetListRow = {
  id: string;
  /** As painted on the trailer. Null only for a row the office never numbered. */
  bleacherNumber: string | null;
  typeName: string | null;
  storageLocationName: string | null;
  zoneName: string | null;
};

/** One bleacher, in full, read-only. */
export type BleacherAssetDetail = AssetListRow & {
  seats: number | null;
  rows: number | null;
  manufacturer: string | null;
  vinNumber: string | null;
  tagNumber: string | null;
  hitchType: string | null;
  trailerHeightInches: number | null;
  trailerLengthInches: number | null;
  gvwrPounds: number | null;
  openingDirection: string | null;
  nvisPdfPath: string | null;
  annualInspection: AnnualInspectionRecord | null;
};

const INCHES_PER_FOOT = 12;

/**
 * One dimension, in inches.
 *
 * `trailer_height_in` / `trailer_length_in` are the columns the office fills
 * in today; `height_folded_ft` / `trailer_length` are what bleachers entered
 * before that migration still carry. Preferring the inch column and converting
 * the foot one keeps both generations of row readable without the screen
 * having to know which era a bleacher came from.
 */
function inchesFrom(inches: number | null, feet: number | null): number | null {
  if (inches !== null && inches !== undefined) return inches;
  if (feet === null || feet === undefined) return null;
  return feet * INCHES_PER_FOOT;
}

function lookupOrNull<T>(
  map: ReadonlyMap<string, T>,
  key: string | null,
): T | null {
  if (!key) return null;
  return map.get(key) ?? null;
}

export function toAssetListRow(
  bleacher: BleacherRow,
  lookups: AssetLookups,
): AssetListRow {
  return {
    id: bleacher.id,
    bleacherNumber: bleacher.bleacher_number,
    typeName:
      lookupOrNull(lookups.types, bleacher.bleacher_type_uuid)?.name ?? null,
    storageLocationName: lookupOrNull(
      lookups.storageLocations,
      bleacher.storage_location_uuid,
    ),
    zoneName: lookupOrNull(lookups.zones, bleacher.zone_uuid),
  };
}

export function toAssetDetail(
  bleacher: BleacherRow,
  lookups: AssetLookups,
  annualInspection: AnnualInspectionRecord | null,
): BleacherAssetDetail {
  const type = lookupOrNull(lookups.types, bleacher.bleacher_type_uuid);

  return {
    ...toAssetListRow(bleacher, lookups),
    seats: bleacher.bleacher_seats,
    // The type is where the office maintains row count; the column on the
    // bleacher is the older copy, kept as the answer of last resort so a phone
    // that has not received `BleacherTypes` still shows a number.
    rows: type?.rowCount ?? bleacher.bleacher_rows,
    manufacturer: bleacher.manufacturer,
    vinNumber: bleacher.vin_number,
    tagNumber: bleacher.tag_number,
    hitchType: bleacher.hitch_type,
    trailerHeightInches: inchesFrom(
      bleacher.trailer_height_in,
      bleacher.height_folded_ft,
    ),
    trailerLengthInches: inchesFrom(
      bleacher.trailer_length_in,
      bleacher.trailer_length,
    ),
    gvwrPounds: bleacher.gvwr,
    openingDirection: bleacher.opening_direction,
    nvisPdfPath: bleacher.nvis_pdf_path,
    annualInspection,
  };
}
