export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function isValidVersion(version: string): boolean {
  return VERSION_PATTERN.test(version);
}

/**
 * Semver compare on major.minor.patch.
 *
 * Never sort versions as strings — "1.10.0" sorts before "1.9.0" that way.
 * Returns <0 when a is older, >0 when a is newer, 0 when equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The newest of a set of versions, or null when the set is empty. */
export function latestVersion(versions: string[]): string | null {
  return versions.filter(isValidVersion).sort(compareVersions).at(-1) ?? null;
}

/** The version a release following `version` should use for a minor bump. */
export function nextMinorVersion(version: string | null): string {
  if (!version) return "1.0.0";
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}
