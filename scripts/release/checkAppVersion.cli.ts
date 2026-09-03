/**
 * CI entry point for the App Store version guard.
 *
 * Usage: npx tsx scripts/release/checkAppVersion.cli.ts <targetBranch>
 *
 * Runs on every pull request, whatever it targets, because the number that
 * matters is always main's — see `checkAppVersionBump`. Assumes main has been
 * fetched. `targetBranch` is only used for the log message.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkAppVersionBump } from "../../features/app-version/utils/checkAppVersionBump";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function versionAt(ref: string): string {
  return JSON.parse(git(["show", `${ref}:package.json`])).version as string;
}

const targetBranch = process.argv[2];
if (!targetBranch) {
  console.error("usage: checkAppVersion.cli.ts <targetBranch>");
  process.exit(2);
}

const headVersion = JSON.parse(readFileSync("package.json", "utf8"))
  .version as string;

let mainVersion: string;
try {
  mainVersion = versionAt("origin/main");
} catch {
  console.error(
    "Could not read package.json from origin/main. Is the branch fetched?",
  );
  process.exit(2);
}

const result = checkAppVersionBump({ headVersion, mainVersion });

if (!result.ok) {
  console.error(`\n✖ App Store version check failed\n\n  ${result.reason}\n`);
  process.exit(1);
}

console.log(`✔ App Store version check passed — ${result.note}`);
