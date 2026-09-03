import type { ChangeLogEntry } from "../types";
import { checkChangelog, type CheckInput } from "./checkChangelog";

const BODY =
  "### A real heading\n\nEnough prose to clear the minimum body length.";

function entry(
  version: string,
  overrides: Partial<Omit<ChangeLogEntry, "version">> = {},
): ChangeLogEntry {
  return { version, date: "2026-09-02", body_md: BODY, ...overrides };
}

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    headEntries: [entry("1.0.0"), entry("1.1.0")],
    baseEntries: [entry("1.0.0")],
    packageVersion: "1.1.0",
    ...overrides,
  };
}

describe("checkChangelog", () => {
  it("passes when the PR adds one newer, well-formed entry matching package.json", () => {
    expect(checkChangelog(input())).toEqual({ ok: true, version: "1.1.0" });
  });

  it("passes on the very first release, when the branch has none", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0")],
        baseEntries: [],
        packageVersion: "1.0.0",
      }),
    );

    expect(result).toEqual({ ok: true, version: "1.0.0" });
  });

  it("fails when no new entry was added", () => {
    const result = checkChangelog(
      input({ headEntries: [entry("1.0.0")], packageVersion: "1.0.0" }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("No new release"),
    });
  });

  it("fails when the PR adds more than one entry", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0"), entry("1.1.0"), entry("1.2.0")],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("One release per pull request"),
    });
  });

  it("fails when the version is not major.minor.patch", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0"), entry("next")],
        packageVersion: "next",
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("major.minor.patch"),
    });
  });

  it("fails when the new version is not newer than the branch", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0"), entry("1.10.0"), entry("1.9.0")],
        baseEntries: [entry("1.0.0"), entry("1.10.0")],
        packageVersion: "1.9.0",
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("not newer than 1.10.0"),
    });
  });

  it("fails when package.json does not match the new entry", () => {
    const result = checkChangelog(input({ packageVersion: "1.0.5" }));

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining('package.json version is "1.0.5"'),
    });
  });

  it("fails when the body is a stub", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0"), entry("1.1.0", { body_md: "### TODO" })],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("too short"),
    });
  });

  it("fails when the release date is missing or malformed", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0"), entry("1.1.0", { date: "not-a-date" })],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("not a valid YYYY-MM-DD date"),
    });
  });

  it("rejects a date shaped right but not a real day", () => {
    const result = checkChangelog(
      input({
        headEntries: [entry("1.0.0"), entry("1.1.0", { date: "2026-13-40" })],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("not a valid YYYY-MM-DD date"),
    });
  });
});
