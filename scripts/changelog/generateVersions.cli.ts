/**
 * Compile `versions/*.md` into `features/changelog/generated/versions.ts`.
 *
 * Usage: npx tsx scripts/changelog/generateVersions.cli.ts [--check]
 *
 * React Native has no filesystem to read the notes from at runtime, and Metro
 * cannot import `.md`, so the bodies are baked into a TypeScript module that
 * ships inside the JS bundle. That is what makes the What's New page work with
 * the phone offline. The file is committed; CI re-runs this with `--check` and
 * fails if the output would differ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions } from "../../features/changelog/util/compareVersions";
import { parseVersionFile } from "../../features/changelog/util/parseVersionFile";
import { readVersionsDir } from "./readVersionsDir";

const ROOT = join(__dirname, "..", "..");
const VERSIONS_DIR = join(ROOT, "versions");
const OUTPUT = join(ROOT, "features", "changelog", "generated", "versions.ts");

const files = readVersionsDir(VERSIONS_DIR);

const entries = Object.keys(files)
  .sort((a, b) => compareVersions(b, a))
  .map((version) => {
    const { date, body } = parseVersionFile(files[version]);
    if (!date) {
      console.error(
        `✖ versions/${version}.md has no valid "date:" frontmatter.`,
      );
      process.exit(1);
    }
    return { version, date, body_md: body };
  });

const generated = `// AUTO-GENERATED — do not edit.
// Run \`npm run changelog:generate\` after adding or editing a file in versions/.
import type { ChangeLogEntry } from "../types";

/** Every release, newest first. */
export const CHANGELOG_ENTRIES: ChangeLogEntry[] = ${JSON.stringify(entries, null, 2)};
`;

const current = safeRead(OUTPUT);

if (process.argv.includes("--check")) {
  if (current !== generated) {
    console.error(
      "\n✖ features/changelog/generated/versions.ts is out of date.\n\n" +
        "  Run `npm run changelog:generate` and commit the result.\n",
    );
    process.exit(1);
  }
  console.log(
    `✔ Generated changelog is up to date — ${entries.length} release(s)`,
  );
} else {
  if (current !== generated) writeFileSync(OUTPUT, generated);
  console.log(
    `✔ Wrote ${entries.length} release(s) to features/changelog/generated/versions.ts`,
  );
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
