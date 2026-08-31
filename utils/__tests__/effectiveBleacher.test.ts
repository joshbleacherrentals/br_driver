import {
  getEffectiveBleacherUuid,
  isSwappedBleacher,
} from "@/utils/effectiveBleacher";

describe("getEffectiveBleacherUuid", () => {
  it("uses the bleacher the driver confirmed taking", () => {
    expect(
      getEffectiveBleacherUuid({
        bleacher_uuid: "assigned",
        actual_bleacher_uuid: "taken",
      }),
    ).toBe("taken");
  });

  it("falls back to the assigned bleacher until the driver confirms", () => {
    expect(
      getEffectiveBleacherUuid({
        bleacher_uuid: "assigned",
        actual_bleacher_uuid: null,
      }),
    ).toBe("assigned");
  });

  it("is null when the trip has no bleacher at all", () => {
    expect(
      getEffectiveBleacherUuid({
        bleacher_uuid: null,
        actual_bleacher_uuid: null,
      }),
    ).toBeNull();
  });

  it("has no work tracker to read", () => {
    expect(getEffectiveBleacherUuid(null)).toBeNull();
  });
});

describe("isSwappedBleacher", () => {
  it("is a swap when the driver confirmed a different bleacher", () => {
    expect(
      isSwappedBleacher({
        bleacher_uuid: "assigned",
        actual_bleacher_uuid: "taken",
      }),
    ).toBe(true);
  });

  it("is not a swap when the driver confirmed the assigned one", () => {
    expect(
      isSwappedBleacher({
        bleacher_uuid: "assigned",
        actual_bleacher_uuid: "assigned",
      }),
    ).toBe(false);
  });

  it("is not a swap before the driver has confirmed anything", () => {
    expect(
      isSwappedBleacher({
        bleacher_uuid: "assigned",
        actual_bleacher_uuid: null,
      }),
    ).toBe(false);
  });
});
