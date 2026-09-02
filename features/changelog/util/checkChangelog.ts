import {
  compareVersions,
  isValidVersion,
  latestVersion,
  nextMinorVersion,
} from "./compareVersions";
import { parseVersionFile } from "./parseVersionFile";

export type CheckInput = {
  /** version → file contents, for every `versions/*.md` on the PR head. */
  headFiles: Record<string, string>;
  /** versions present in `versions/` on the target branch. */
  baseVersions: string[];
  /** paths added by this PR relative to the target branch. */
  addedFiles: string[];
};

export type CheckResult =
  { ok: true; version: string } | { ok: false; reason: string };

/** A file with only whitespace or a stub heading is not release notes. */
const MIN_BODY_CHARS = 40;

const VERSION_FILE = /^versions\/(.+)\.md$/;

/**
 * The PR gate: every promotion into a deployable branch adds exactly one new
 * release-notes file, newer than anything already on that branch.
 *
 * Deliberately NOT keyed to `package.json` like the web app's equivalent.
 * `app.json` sets `runtimeVersion.policy: "appVersion"` and `app.config.ts`
 * takes `version` from `package.json`, so bumping it per release would change
 * the runtime version every time and strand every OTA update. The newest file
 * in `versions/` is the changelog's own version line, independent of the store
 * version drivers see in the side navigation.
 */
export function checkChangelog(input: CheckInput): CheckResult {
  const { headFiles, baseVersions, addedFiles } = input;

  const previous = latestVersion(baseVersions);
  const suggested = nextMinorVersion(previous);

  const added = addedFiles
    .map((path) => VERSION_FILE.exec(path)?.[1])
    .filter((version): version is string => version !== undefined);

  if (added.length === 0) {
    return {
      ok: false,
      reason: `No release notes in this pull request. Add versions/${suggested}.md describing what changed.`,
    };
  }

  if (added.length > 1) {
    return {
      ok: false,
      reason:
        `This pull request adds ${added.length} version files (${added.join(", ")}). ` +
        `One release per pull request — fold them into a single file.`,
    };
  }

  const version = added[0];

  if (!isValidVersion(version)) {
    return {
      ok: false,
      reason: `versions/${version}.md is not named major.minor.patch. Rename it to versions/${suggested}.md.`,
    };
  }

  if (previous && compareVersions(version, previous) <= 0) {
    return {
      ok: false,
      reason:
        `versions/${version}.md is not newer than ${previous}, which the target branch already has. ` +
        `Use versions/${suggested}.md or higher.`,
    };
  }

  const contents = headFiles[version];
  if (contents === undefined) {
    return {
      ok: false,
      reason: `versions/${version}.md was added but could not be read.`,
    };
  }

  const { date, body } = parseVersionFile(contents);

  if (body.length < MIN_BODY_CHARS) {
    return {
      ok: false,
      reason: `versions/${version}.md is empty or too short to be useful release notes.`,
    };
  }

  if (!date) {
    return {
      ok: false,
      reason:
        `versions/${version}.md has no valid release date. Start the file with ` +
        `frontmatter:\n\n  ---\n  date: YYYY-MM-DD\n  ---`,
    };
  }

  return { ok: true, version };
}
