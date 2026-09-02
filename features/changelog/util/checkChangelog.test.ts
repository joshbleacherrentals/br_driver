import { checkChangelog, type CheckInput } from "./checkChangelog";

const BODY =
  "---\ndate: 2026-09-02\n---\n\n### A real heading\n\nEnough prose to clear the minimum.";

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    headFiles: { "1.0.0": BODY, "1.1.0": BODY },
    baseVersions: ["1.0.0"],
    addedFiles: ["versions/1.1.0.md"],
    ...overrides,
  };
}

describe("checkChangelog", () => {
  it("passes when the PR adds one newer, well-formed file", () => {
    expect(checkChangelog(input())).toEqual({ ok: true, version: "1.1.0" });
  });

  it("passes on the very first release, when the branch has none", () => {
    const result = checkChangelog(
      input({
        headFiles: { "1.0.0": BODY },
        baseVersions: [],
        addedFiles: ["versions/1.0.0.md"],
      }),
    );

    expect(result).toEqual({ ok: true, version: "1.0.0" });
  });

  it("ignores non-version files the PR also added", () => {
    const result = checkChangelog(
      input({
        addedFiles: [
          "features/changelog/types.ts",
          "versions/1.1.0.md",
          "README.md",
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("fails when no release notes were added", () => {
    const result = checkChangelog(
      input({ addedFiles: ["features/trips/TripsScreen.tsx"] }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("versions/1.1.0.md"),
    });
  });

  it("fails when the PR adds more than one release", () => {
    const result = checkChangelog(
      input({
        headFiles: { "1.0.0": BODY, "1.1.0": BODY, "1.2.0": BODY },
        addedFiles: ["versions/1.1.0.md", "versions/1.2.0.md"],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("One release per pull request"),
    });
  });

  it("fails when the file name is not major.minor.patch", () => {
    const result = checkChangelog(
      input({ headFiles: { "1.0.0": BODY }, addedFiles: ["versions/next.md"] }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("major.minor.patch"),
    });
  });

  it("fails when the new version is not newer than the branch", () => {
    const result = checkChangelog(
      input({
        headFiles: { "1.0.0": BODY, "1.9.0": BODY, "1.10.0": BODY },
        baseVersions: ["1.0.0", "1.10.0"],
        addedFiles: ["versions/1.9.0.md"],
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("not newer than 1.10.0"),
    });
  });

  it("fails when the body is a stub", () => {
    const result = checkChangelog(
      input({
        headFiles: { "1.1.0": "---\ndate: 2026-09-02\n---\n\n### TODO" },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("too short"),
    });
  });

  it("fails when the release date is missing", () => {
    const result = checkChangelog(
      input({
        headFiles: {
          "1.1.0": "### A real heading\n\nEnough prose to clear the minimum.",
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("no valid release date"),
    });
  });
});
