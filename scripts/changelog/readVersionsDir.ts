/**
 * Read `versions/*.md` off disk into `version → contents`.
 *
 * Shared by the generator and the CI gate so both agree on which files count:
 * anything not named a bare `major.minor.patch` is ignored, the same rule the
 * gate applies before accepting a release.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidVersion } from "../../features/changelog/util/compareVersions";

export function readVersionsDir(dir: string): Record<string, string> {
  let fileNames: string[];
  try {
    fileNames = readdirSync(dir);
  } catch {
    // No versions/ directory yet — the first release creates it.
    return {};
  }

  const files: Record<string, string> = {};

  for (const name of fileNames) {
    if (!name.endsWith(".md")) continue;
    const version = name.slice(0, -".md".length);
    if (!isValidVersion(version)) continue;
    files[version] = readFileSync(join(dir, name), "utf8");
  }

  return files;
}
