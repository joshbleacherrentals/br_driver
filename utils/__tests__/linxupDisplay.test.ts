/**
 * How the Live Location screen writes the tracker's numbers.
 *
 * "Last Updated" is relative on purpose: a driver wants to know whether the
 * pin is five minutes or two days stale, not to do date arithmetic in a
 * field. It reuses the roster's own phrasing so both read the same.
 */

import {
  formatCoordinate,
  formatLastUpdated,
  formatSpeed,
} from "@/utils/eventRoster/linxupDisplay";

const NOW = Date.parse("2026-09-23T15:00:00Z");
const MIN = 60 * 1000;

describe("formatLastUpdated", () => {
  it.each([
    [NOW - 20 * 1000, "just now"],
    [NOW - 5 * MIN, "5 min ago"],
    [NOW - (3 * 60 + 15) * MIN, "3 h 15 min ago"],
    [NOW - 2 * 24 * 60 * MIN, "2 days ago"],
  ])("reads %p as %p", (updatedAtMs, expected) => {
    expect(formatLastUpdated(updatedAtMs, NOW)).toBe(expected);
  });

  it("reads a reading from the future (clock skew) as just now", () => {
    expect(formatLastUpdated(NOW + 10 * MIN, NOW)).toBe("just now");
  });

  it("says nothing when the tracker sent no time", () => {
    expect(formatLastUpdated(undefined, NOW)).toBeNull();
  });
});

describe("formatCoordinate", () => {
  it("shows six decimals, like the web card", () => {
    expect(formatCoordinate(43.6532)).toBe("43.653200");
    expect(formatCoordinate(-79.38321234)).toBe("-79.383212");
  });
});

describe("formatSpeed", () => {
  it("shows the speed with its unit", () => {
    expect(formatSpeed(88)).toBe("88 km/h");
    expect(formatSpeed(0)).toBe("0 km/h");
  });

  it("says N/A when the tracker sent no speed", () => {
    expect(formatSpeed(undefined)).toBe("N/A");
  });
});
