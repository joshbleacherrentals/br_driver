/**
 * Resolving one bleacher row into the thing the Assets screens render.
 *
 * Four tables meet here — the bleacher itself, its type, its storage location
 * and its zone — and this is the only place they meet. Everything above reads
 * names; nothing above knows a `*_uuid` exists.
 *
 * Two of those tables are new to the phone, so the interesting cases are the
 * ones where a lookup has not arrived yet. A bleacher whose type has not
 * synced is still a bleacher a driver is standing next to: the screen owes
 * them every field it CAN answer, never a blank page.
 */

import {
  toAssetDetail,
  toAssetListRow,
  type AssetLookups,
  type BleacherRow,
} from "@/features/assets/utils/bleacherAssetView";

const EMPTY_LOOKUPS: AssetLookups = {
  types: new Map(),
  storageLocations: new Map(),
  zones: new Map(),
};

function lookups(over: Partial<AssetLookups> = {}): AssetLookups {
  return { ...EMPTY_LOOKUPS, ...over };
}

function bleacher(over: Partial<BleacherRow> = {}): BleacherRow {
  return {
    id: "b1",
    bleacher_number: "212",
    bleacher_seats: 180,
    bleacher_rows: 5,
    bleacher_type_uuid: null,
    storage_location_uuid: null,
    zone_uuid: null,
    manufacturer: null,
    vin_number: null,
    tag_number: null,
    hitch_type: null,
    trailer_height_in: null,
    trailer_length_in: null,
    height_folded_ft: null,
    trailer_length: null,
    gvwr: null,
    opening_direction: null,
    nvis_pdf_path: null,
    ...over,
  };
}

describe("row count", () => {
  it("comes from the bleacher type, which is where the office maintains it", () => {
    const detail = toAssetDetail(
      bleacher({ bleacher_type_uuid: "t1", bleacher_rows: 5 }),
      lookups({
        types: new Map([["t1", { name: "10-Row Open", rowCount: 10 }]]),
      }),
      null,
    );

    expect(detail.rows).toBe(10);
    expect(detail.typeName).toBe("10-Row Open");
  });

  it("falls back to the bleacher's own count while the type has not synced", () => {
    const detail = toAssetDetail(
      bleacher({ bleacher_type_uuid: "t1", bleacher_rows: 5 }),
      EMPTY_LOOKUPS,
      null,
    );

    expect(detail.rows).toBe(5);
    expect(detail.typeName).toBeNull();
  });
});

describe("trailer dimensions", () => {
  it("prefers the inch columns, which are the ones the office now fills in", () => {
    const detail = toAssetDetail(
      bleacher({
        trailer_height_in: 90,
        trailer_length_in: 320,
        height_folded_ft: 6,
        trailer_length: 24,
      }),
      EMPTY_LOOKUPS,
      null,
    );

    expect(detail.trailerHeightInches).toBe(90);
    expect(detail.trailerLengthInches).toBe(320);
  });

  it("reads the older foot columns when a bleacher predates the inch ones", () => {
    const detail = toAssetDetail(
      bleacher({
        trailer_height_in: null,
        trailer_length_in: null,
        height_folded_ft: 6,
        trailer_length: 24,
      }),
      EMPTY_LOOKUPS,
      null,
    );

    expect(detail.trailerHeightInches).toBe(72);
    expect(detail.trailerLengthInches).toBe(288);
  });
});

describe("storage location and zone", () => {
  it("renders the names the office gave them, not their ids", () => {
    const row = toAssetListRow(
      bleacher({ storage_location_uuid: "s1", zone_uuid: "z1" }),
      lookups({
        storageLocations: new Map([["s1", "Sparta Yard"]]),
        zones: new Map([["z1", "Midwest"]]),
      }),
    );

    expect(row.storageLocationName).toBe("Sparta Yard");
    expect(row.zoneName).toBe("Midwest");
  });

  it("leaves a name blank rather than leaking a uuid the phone cannot resolve", () => {
    const row = toAssetListRow(
      bleacher({ storage_location_uuid: "gone", zone_uuid: "gone-too" }),
      EMPTY_LOOKUPS,
    );

    expect(row.storageLocationName).toBeNull();
    expect(row.zoneName).toBeNull();
  });
});
