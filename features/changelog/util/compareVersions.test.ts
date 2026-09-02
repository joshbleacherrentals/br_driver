import {
  compareVersions,
  isValidVersion,
  latestVersion,
  nextMinorVersion,
} from "./compareVersions";

describe("isValidVersion", () => {
  it("accepts bare major.minor.patch", () => {
    expect(isValidVersion("1.0.0")).toBe(true);
    expect(isValidVersion("10.20.30")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidVersion("1.0")).toBe(false);
    expect(isValidVersion("v1.0.0")).toBe(false);
    expect(isValidVersion("1.0.0-beta")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("orders numerically, not lexicographically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });

  it("returns 0 for equal versions", () => {
    expect(compareVersions("2.3.4", "2.3.4")).toBe(0);
  });

  it("compares patch when major and minor match", () => {
    expect(compareVersions("1.2.3", "1.2.10")).toBeLessThan(0);
  });
});

describe("latestVersion", () => {
  it("picks the newest and ignores malformed names", () => {
    expect(latestVersion(["1.9.0", "1.10.0", "draft", "1.2.0"])).toBe("1.10.0");
  });

  it("returns null when there are no versions", () => {
    expect(latestVersion([])).toBeNull();
  });
});

describe("nextMinorVersion", () => {
  it("bumps the minor and resets the patch", () => {
    expect(nextMinorVersion("1.9.3")).toBe("1.10.0");
  });

  it("starts at 1.0.0 when nothing has been released", () => {
    expect(nextMinorVersion(null)).toBe("1.0.0");
  });
});
