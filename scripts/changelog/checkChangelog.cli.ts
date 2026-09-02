/**
 * CI entry point for the changelog PR gate.
 *
 * Usage: npx tsx scripts/changelog/checkChangelog.cli.ts <targetBranch>
 *
 * Assumes the target branch has been fetched (actions/checkout with
 * fetch-depth: 0, plus an explicit `git fetch origin <target>`).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { checkChangelog } from "../../features/changelog/util/checkChangelog";
import {
  latestVersion,
  nextMinorVersion,
} from "../../features/changelog/util/compareVersions";
import { readVersionsDir } from "./readVersionsDir";

function git(args: string[]): string {
  // stderr is swallowed: a missing `versions/` on the target branch is an
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

let baseVersions: string[];
try {
  // `ls-tree` rather than a checkout, so the working tree stays on the PR head.
  baseVersions = git(["ls-tree", "--name-only", `${ref}:versions`])
    .split("\n")
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length));
} catch {
  // No versions/ on the target branch yet — this PR introduces the first one.
  baseVersions = [];
}

const headFiles = readVersionsDir(join(__dirname, "..", "..", "versions"));

const addedFiles = git([
  "diff",
  "--name-only",
  "--diff-filter=A",
  `${ref}...HEAD`,
])
  .split("\n")
  .filter(Boolean);

const result = checkChangelog({ headFiles, baseVersions, addedFiles });

if (!result.ok) {
  const previous = latestVersion(baseVersions);
  console.error(`\n✖ Changelog check failed\n\n  ${result.reason}\n`);
  console.error(
    `  Target branch ${target} is at ${previous ?? "no releases yet"}. ` +
      `Add versions/${nextMinorVersion(previous)}.md and run \`npm run changelog:generate\`.\n`,
  );
  process.exit(1);
}

console.log(
  `✔ Changelog check passed — ${result.version} documented in versions/${result.version}.md`,
);
