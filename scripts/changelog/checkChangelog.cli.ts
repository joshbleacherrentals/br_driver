/**
 * CI entry point for the changelog + App Store version PR gate.
 *
 * Usage: npx tsx scripts/changelog/checkChangelog.cli.ts <targetBranch>
 *
 * Assumes the target branch has been fetched (actions/checkout with
 * fetch-depth: 0, plus an explicit `git fetch origin <target>`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangeLogEntry } from "../../features/changelog/types";
import { checkChangelog } from "../../features/changelog/util/checkChangelog";
import {
  latestVersion,
  nextMinorVersion,
} from "../../features/changelog/util/compareVersions";

const ENTRIES_PATH = "features/changelog/entries.json";

function git(args: string[]): string {
  // stderr is swallowed: a missing entries.json on the target branch is an
  // expected, handled case, and git's "not a valid object name" would read as
  // a broken workflow in the CI log.
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

const target = process.argv[2];
if (!target) {
  console.error("usage: checkChangelog.cli.ts <targetBranch>");
  process.exit(2);
}

const ref = `origin/${target}`;

let baseEntries: ChangeLogEntry[];
try {
  baseEntries = JSON.parse(git(["show", `${ref}:${ENTRIES_PATH}`]));
} catch {
  // No entries.json on the target branch yet — this PR introduces the first one.
  baseEntries = [];
}

const headEntries: ChangeLogEntry[] = JSON.parse(
  readFileSync(join(__dirname, "..", "..", ENTRIES_PATH), "utf8"),
);

const packageVersion = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
).version as string;

const result = checkChangelog({ headEntries, baseEntries, packageVersion });

if (!result.ok) {
  const baseVersions = baseEntries.map((entry) => entry.version);
  const previous = latestVersion(baseVersions);
  const next = nextMinorVersion(previous);
  console.error(`\n✖ Changelog check failed\n\n  ${result.reason}\n`);
  console.error(
    `  Target branch ${target} is at ${previous ?? "no releases yet"}. ` +
      `Add a "${next}" entry to ${ENTRIES_PATH} and bump "version" in package.json to "${next}".\n`,
  );
  process.exit(1);
}

console.log(
  `✔ Changelog check passed — ${result.version} documented in ${ENTRIES_PATH}, ` +
    `package.json matches.`,
);
