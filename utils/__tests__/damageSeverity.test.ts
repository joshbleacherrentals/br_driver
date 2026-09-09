/**
 * Damage severity, as it is read off a report row.
 *
 * Two shapes reach the client for the same fact: `'major' | 'minor' | 'none'`
 * from the enum, and `'1' | '0'` from the older `is_safe_to_*` era. Both are
 * still in the database, so both are still on phones — a report filed in 2026
 * and one filed before the enum landed sit in the same list.
 *
 * `worstSeverity` is what a card shows when it has room for one badge and the
 * report carries two ratings: the reader needs to know the worst of them, not
 * the first of them.
 */

import { severityLabel, worstSeverity } from "@/utils/damageSeverity";

describe("severityLabel", () => {
  it.each([
    ["major", "Major"],
    ["minor", "Minor"],
    ["none", "None"],
  ])("names the enum value %s", (value, expected) => {
    expect(severityLabel(value)).toBe(expected);
  });

  it.each([
    ["1", "Major"],
    ["0", "Minor"],
  ])("still reads the legacy value %s", (value, expected) => {
    expect(severityLabel(value)).toBe(expected);
  });

  it("calls an absent rating None rather than blank", () => {
    expect(severityLabel(null)).toBe("None");
  });
});

describe("worstSeverity", () => {
  it("reports major when either rating is major", () => {
    expect(worstSeverity("none", "major")).toBe("major");
    expect(worstSeverity("major", "none")).toBe("major");
  });

  it("prefers major over minor", () => {
    expect(worstSeverity("minor", "major")).toBe("major");
  });

  it("reports minor when that is the worst there is", () => {
    expect(worstSeverity("minor", "none")).toBe("minor");
  });

  it("reports none only when neither rating says otherwise", () => {
    expect(worstSeverity("none", "none")).toBe("none");
    expect(worstSeverity(null, null)).toBe("none");
  });

  it("reads legacy ratings too", () => {
    expect(worstSeverity("1", "0")).toBe("major");
    expect(worstSeverity("0", null)).toBe("minor");
  });
});
