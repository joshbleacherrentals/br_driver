import type { ChangeLogEntry } from "../types";
import {
  compareVersions,
  isValidVersion,
  latestVersion,
  nextMinorVersion,
} from "./compareVersions";

export type CheckInput = {
  /** Entries in `features/changelog/entries.json` on the PR head. */
  headEntries: ChangeLogEntry[];
  /** Entries in the same file on the target branch. */
  baseEntries: ChangeLogEntry[];
  /** `version` from package.json on the PR head. */
  packageVersion: string;
};

export type CheckResult =
  { ok: true; version: string } | { ok: false; reason: string };

/** An entry with only whitespace or a stub heading is not release notes. */
const MIN_BODY_CHARS = 40;

/**
 * The PR gate: every promotion into a deployable branch adds exactly one new
 * entry to `features/changelog/entries.json`, newer than anything already
 * there, and bumps `package.json` to that exact version.
 *
 * `entries.json` is the single source of truth for version history —
 * hand-edited, append-only, one entry per shipped release, and the only file
 * the app actually reads (Metro imports `.json` natively, so there's no
 * separate generated bundle that can fall out of sync with it).
 * `package.json`'s version has to match the newest entry exactly, so the two
 * numbers can never drift apart. Since every PR bumps both together, this
 * also guarantees the version only ever moves forward, on every target
 * branch — no separate "is this higher than production" check needed.
 */
export function checkChangelog(input: CheckInput): CheckResult {
  const { headEntries, baseEntries, packageVersion } = input;

  const baseVersions = baseEntries.map((entry) => entry.version);
  const previous = latestVersion(baseVersions);
  const suggested = nextMinorVersion(previous);

  const baseVersionSet = new Set(baseVersions);
  const added = headEntries.filter(
    (entry) => !baseVersionSet.has(entry.version),
  );

  if (added.length === 0) {
    return {
      ok: false,
      reason: `No new release in features/changelog/entries.json. Add a "${suggested}" entry describing what changed.`,
    };
  }

  if (added.length > 1) {
    const versions = added.map((entry) => entry.version).join(", ");
    return {
      ok: false,
      reason:
        `This pull request adds ${added.length} new entries (${versions}). ` +
        `One release per pull request — fold them into a single entry.`,
    };
  }

  const { version, date, body_md } = added[0];

  if (!isValidVersion(version)) {
    return {
      ok: false,
      reason: `"${version}" is not named major.minor.patch. Use "${suggested}" instead.`,
    };
  }

  if (previous && compareVersions(version, previous) <= 0) {
    return {
      ok: false,
      reason:
        `"${version}" is not newer than ${previous}, which the target branch already has. ` +
        `Use "${suggested}" or higher.`,
    };
  }

  if (packageVersion !== version) {
    return {
      ok: false,
      reason:
        `package.json version is "${packageVersion}" but the new entry is "${version}" — ` +
        `they must match. Bump "version" in package.json to "${version}" (or change the entry's ` +
        `version to "${packageVersion}" if that's what you meant to ship).`,
    };
  }

  if (body_md.trim().length < MIN_BODY_CHARS) {
    return {
      ok: false,
      reason: `The "${version}" entry's body_md is empty or too short to be useful release notes.`,
    };
  }

  if (!isValidReleaseDate(date)) {
    return {
      ok: false,
      reason: `The "${version}" entry's date ("${date}") is not a valid YYYY-MM-DD date.`,
    };
  }

  return { ok: true, version };
}

/** Rejects shapes that pass the regex but are not real days, e.g. 2026-13-40. */
function isValidReleaseDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
  );
}
