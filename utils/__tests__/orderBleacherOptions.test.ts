import {
  orderBleacherOptions,
  type OrderableBleacher,
} from "@/utils/orderBleacherOptions";

/** Minimal row — only the columns the ordering actually reads. */
function bleacher(
  id: string,
  number: string | null,
  extra: Partial<OrderableBleacher> = {},
): OrderableBleacher {
  return {
    id,
    bleacher_number: number,
    zone_uuid: null,
    storage_location_uuid: null,
    deleted: 0,
    ...extra,
  };
}

const WAREHOUSE_A = "loc-a";
const WAREHOUSE_B = "loc-b";
const ZONE_NORTH = "zone-north";
const ZONE_SOUTH = "zone-south";

describe("orderBleacherOptions", () => {
  it("puts the assigned bleacher first, on its own", () => {
    const assigned = bleacher("b1", "1", { storage_location_uuid: WAREHOUSE_A });
    const other = bleacher("b2", "2", { storage_location_uuid: WAREHOUSE_A });

    const result = orderBleacherOptions([other, assigned], assigned);

    expect(result[0]).toMatchObject({ id: "b1", group: "assigned" });
    expect(result.filter((o) => o.group === "assigned")).toHaveLength(1);
  });

  it("ranks same warehouse above same zone above everything else", () => {
    const assigned = bleacher("b1", "1", {
      storage_location_uuid: WAREHOUSE_A,
      zone_uuid: ZONE_NORTH,
    });
    const sameWarehouse = bleacher("b2", "2", {
      storage_location_uuid: WAREHOUSE_A,
      zone_uuid: ZONE_SOUTH,
    });
    const sameZone = bleacher("b3", "3", {
      storage_location_uuid: WAREHOUSE_B,
      zone_uuid: ZONE_NORTH,
    });
    const unrelated = bleacher("b4", "4", {
      storage_location_uuid: WAREHOUSE_B,
      zone_uuid: ZONE_SOUTH,
    });

    const result = orderBleacherOptions(
      [unrelated, sameZone, sameWarehouse, assigned],
      assigned,
    );

    expect(result.map((o) => o.id)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(result.map((o) => o.group)).toEqual([
      "assigned",
      "same_location",
      "same_zone",
      "other",
    ]);
  });

  it("counts a same-warehouse bleacher once, not in both groups", () => {
    const assigned = bleacher("b1", "1", {
      storage_location_uuid: WAREHOUSE_A,
      zone_uuid: ZONE_NORTH,
    });
    const both = bleacher("b2", "2", {
      storage_location_uuid: WAREHOUSE_A,
      zone_uuid: ZONE_NORTH,
    });

    const result = orderBleacherOptions([assigned, both], assigned);

    expect(result.filter((o) => o.id === "b2")).toEqual([
      expect.objectContaining({ group: "same_location" }),
    ]);
  });

  it("sorts by bleacher number numerically, not as text", () => {
    const assigned = bleacher("a", "1", { storage_location_uuid: WAREHOUSE_A });
    const nine = bleacher("b9", "9", { storage_location_uuid: WAREHOUSE_A });
    const ten = bleacher("b10", "10", { storage_location_uuid: WAREHOUSE_A });
    const two = bleacher("b2", "2", { storage_location_uuid: WAREHOUSE_A });

    const result = orderBleacherOptions([ten, nine, two, assigned], assigned);

    expect(result.map((o) => o.id)).toEqual(["a", "b2", "b9", "b10"]);
  });

  it("sorts unnumbered bleachers last within their group", () => {
    const numbered = bleacher("b7", "7");
    const unnumbered = bleacher("bx", null);

    const result = orderBleacherOptions([unnumbered, numbered], null);

    expect(result.map((o) => o.id)).toEqual(["b7", "bx"]);
  });

  it("leaves out deleted bleachers", () => {
    const live = bleacher("b1", "1");
    const gone = bleacher("b2", "2", { deleted: 1 });

    const result = orderBleacherOptions([live, gone], null);

    expect(result.map((o) => o.id)).toEqual(["b1"]);
  });

  it("still offers the assigned bleacher when it is marked deleted", () => {
    // The manager assigned it; hiding it would leave the picker unable to show
    // what the trip is actually for.
    const assigned = bleacher("b1", "1", { deleted: 1 });
    const other = bleacher("b2", "2");

    const result = orderBleacherOptions([assigned, other], assigned);

    expect(result.map((o) => o.id)).toEqual(["b1", "b2"]);
  });

  it("does not treat two unknown warehouses as the same warehouse", () => {
    // Null is "we don't know where this is", not a location they share.
    const assigned = bleacher("b1", "1");
    const alsoUnknown = bleacher("b2", "2");

    const result = orderBleacherOptions([assigned, alsoUnknown], assigned);

    expect(result[1]).toMatchObject({ id: "b2", group: "other" });
  });

  it("does not treat two unknown zones as the same zone", () => {
    const assigned = bleacher("b1", "1", {
      storage_location_uuid: WAREHOUSE_A,
    });
    const alsoUnknown = bleacher("b2", "2", {
      storage_location_uuid: WAREHOUSE_B,
    });

    const result = orderBleacherOptions([assigned, alsoUnknown], assigned);

    expect(result[1]).toMatchObject({ id: "b2", group: "other" });
  });

  it("groups everything as other when no bleacher is assigned yet", () => {
    const a = bleacher("b2", "2", { storage_location_uuid: WAREHOUSE_A });
    const b = bleacher("b1", "1", { storage_location_uuid: WAREHOUSE_A });

    const result = orderBleacherOptions([a, b], null);

    expect(result.map((o) => o.id)).toEqual(["b1", "b2"]);
    expect(result.every((o) => o.group === "other")).toBe(true);
  });

  it("groups by the assigned bleacher even when it is absent from the list", () => {
    // It can be missing: filtered out upstream, or not yet synced.
    const assigned = bleacher("b1", "1", {
      storage_location_uuid: WAREHOUSE_A,
    });
    const neighbour = bleacher("b2", "2", {
      storage_location_uuid: WAREHOUSE_A,
    });
    const far = bleacher("b3", "3", { storage_location_uuid: WAREHOUSE_B });

    const result = orderBleacherOptions([far, neighbour], assigned);

    expect(result.map((o) => o.id)).toEqual(["b2", "b3"]);
    expect(result.map((o) => o.group)).toEqual(["same_location", "other"]);
  });

  it("returns nothing for an empty fleet", () => {
    expect(orderBleacherOptions([], null)).toEqual([]);
  });
});
