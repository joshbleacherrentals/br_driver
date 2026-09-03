import {
  checkAppVersionBump,
  type AppVersionCheckInput,
} from "./checkAppVersionBump";

function input(
  overrides: Partial<AppVersionCheckInput> = {},
): AppVersionCheckInput {
  return {
    headVersion: "1.8.0",
    mainVersion: "1.7.0",
    ...overrides,
  };
}

describe("checkAppVersionBump", () => {
  it("fails a feature branch into dev that still carries main's version", () => {
    const result = checkAppVersionBump(input({ headVersion: "1.7.0" }));

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("ITMS-90062"),
    });
  });

  it("passes a feature branch into dev once the bump has happened", () => {
    expect(checkAppVersionBump(input())).toEqual({
      ok: true,
      note: expect.stringContaining("ahead of main's 1.7.0"),
    });
  });

  it("passes a later feature branch that inherits dev's already-bumped version", () => {
    // dev is at 1.8.0, main still 1.7.0 — the bump happened on an earlier PR.
    const result = checkAppVersionBump(
      input({ headVersion: "1.8.0", mainVersion: "1.7.0" }),
    );

    expect(result.ok).toBe(true);
  });

  it("fails a version that went backwards", () => {
    expect(checkAppVersionBump(input({ headVersion: "1.6.0" })).ok).toBe(false);
  });

  it("holds every PR to the same bar, no exceptions for main or JS-only changes", () => {
    const result = checkAppVersionBump(input({ headVersion: "1.7.0" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed version", () => {
    const result = checkAppVersionBump(input({ headVersion: "1.9" }));

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("major.minor.patch"),
    });
  });
});
