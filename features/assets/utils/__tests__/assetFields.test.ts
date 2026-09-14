/**
 * How a bleacher's specification reads on a phone.
 *
 * The screen is read-only reference material: a driver checking a hitch before
 * coupling, or reading a GVWR off to a weigh-station officer. So a value the
 * office never filled in must say so plainly — a blank line is indistinguishable
 * from a zero, and a zero GVWR is a different (and alarming) claim from "we
 * don't have it on file".
 */

import {
  formatDistance,
  formatGvwr,
  formatLength,
  formatValue,
} from "@/features/assets/utils/assetFields";

describe("formatValue", () => {
  it("says nothing is on file rather than leaving a gap", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue("")).toBe("—");
    expect(formatValue("   ")).toBe("—");
  });

  it("passes a real value through untouched", () => {
    expect(formatValue("Pintle")).toBe("Pintle");
  });
});

describe("formatGvwr", () => {
  it("reads the way a weigh-station officer expects to hear it", () => {
    expect(formatGvwr(14000)).toBe("14,000 lbs");
    expect(formatGvwr(7500)).toBe("7,500 lbs");
  });

  it("treats a missing rating as missing, not as a bleacher that weighs nothing", () => {
    expect(formatGvwr(null)).toBe("—");
    expect(formatGvwr(0)).toBe("—");
  });
});

describe("formatLength", () => {
  it("gives feet and inches, the way a trailer is measured", () => {
    expect(formatLength(90)).toBe(`7' 6"`);
    expect(formatLength(25)).toBe(`2' 1"`);
  });

  it("drops the inches when it lands on a whole foot", () => {
    expect(formatLength(96)).toBe(`8'`);
  });

  it("has nothing to say about a dimension nobody measured", () => {
    expect(formatLength(null)).toBe("—");
    expect(formatLength(0)).toBe("—");
  });
});

describe("formatDistance", () => {
  it("answers in miles, which is what the odometer reads", () => {
    expect(formatDistance(16093)).toBe("10 mi");
    expect(formatDistance(1609344)).toBe("1,000 mi");
  });

  it("keeps zero, because a bleacher that has never moved really has not", () => {
    expect(formatDistance(0)).toBe("0 mi");
  });

  it("still admits when there is no record at all", () => {
    expect(formatDistance(null)).toBe("—");
  });
});
