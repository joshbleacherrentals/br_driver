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
    targetBranch: "dev",
    changedFiles: ["features/trips/TripsScreen.tsx"],
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

  it("applies the same bar to staging and main", () => {
    for (const targetBranch of ["staging", "main"]) {
      const result = checkAppVersionBump(
        input({
          headVersion: "1.7.0",
          targetBranch,
          changedFiles: ["app.json"],
        }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("lets a JS-only hotfix into main keep the version it is patching", () => {
    const result = checkAppVersionBump(
      input({
        headVersion: "1.7.0",
        targetBranch: "main",
        changedFiles: ["features/trips/TripsScreen.tsx"],
      }),
    );

    expect(result).toEqual({
      ok: true,
      note: expect.stringContaining("OTA update"),
    });
  });

  it("does not extend that exception to dev", () => {
    const result = checkAppVersionBump(
      input({
        headVersion: "1.7.0",
        targetBranch: "dev",
        changedFiles: ["features/trips/TripsScreen.tsx"],
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("holds a native change into main to the bump even though it is a hotfix path", () => {
    for (const path of [
      "package.json",
      "package-lock.json",
      "app.json",
      "app.config.ts",
      "eas.json",
      "plugins/withSomething.js",
      "patches/react-native+0.83.6.patch",
    ]) {
      const result = checkAppVersionBump(
        input({
          headVersion: "1.7.0",
          targetBranch: "main",
          changedFiles: [path],
        }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("does not mistake a lookalike path for a native change", () => {
    const result = checkAppVersionBump(
      input({
        headVersion: "1.7.0",
        targetBranch: "main",
        changedFiles: ["docs/plugins/notes.md", "my-app.json"],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a malformed version", () => {
    const result = checkAppVersionBump(input({ headVersion: "1.9" }));

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("major.minor.patch"),
    });
  });
});
