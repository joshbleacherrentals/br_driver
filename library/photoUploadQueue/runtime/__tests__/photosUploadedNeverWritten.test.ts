/**
 * `DamageReports.photos_uploaded` is server-derived — computed exclusively by
 * Postgres triggers in
 * bleacher_rentals/supabase/migrations/20260820120000_damage_reports_photos_uploaded.sql.
 * No client, this one included, may ever write it. This file is the guard for
 * that invariant, from two directions:
 *
 *  1. COMPILE-TIME: `AppSchema.ts` declares `DamageReportsCols` with
 *     `satisfies Partial<PowerSyncColsFor<"DamageReports">>` specifically so
 *     `photos_uploaded` can be left undeclared. If it is ever added back to
 *     the local schema, the type check below stops compiling — see the
 *     comment on `DamageReportsCols` for the full reasoning.
 *  2. RUNTIME: a plain source scan confirms `photos_uploaded` never appears
 *     as a write-payload key (`photos_uploaded:`) anywhere in app source,
 *     independent of whatever the type system happens to allow.
 *
 * Sibling to `statusWritesAreLocalOnly.test.ts` (which is locked and covers a
 * different table — `DamageReportPhotos`'s §3 bookkeeping split). This file
 * is new, not an edit to that one.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { PowerSyncDB } from "@/library/powersync/AppSchema";
import type { Equal } from "@/library/powersync/types";

// ─── 1. Compile-time guard ──────────────────────────────────────────────────

type PhotosUploadedIsNotLocal = Equal<
  "photos_uploaded" extends keyof PowerSyncDB["DamageReports"] ? true : false,
  false
>;
// If `photos_uploaded` is ever added to DamageReportsCols in AppSchema.ts,
// `PhotosUploadedIsNotLocal` becomes `Equal<true, false>` (= false), and this
// line stops typechecking (`npm run tc` is what actually enforces it; Jest's
// transpile step does not type-check).
const photosUploadedIsNotLocal: PhotosUploadedIsNotLocal = true;

// ─── 2. Runtime source scan ─────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// Directories that hold app source. Excludes node_modules, native build
// output, and anything under __tests__/fixtures.
const SCAN_DIRS = [
  "app",
  "components",
  "features",
  "hooks",
  "library",
  "services",
  "utils",
  "constants",
];

// database.types.ts is a hand-copied *type* listing (Step 8.1) — it is
// expected to name every column, including this one, without writing
// anything. This file's own docstring/identifiers also legitimately mention
// the pattern being scanned for. Both are excluded from the scan below.
const EXCLUDED_FILES = new Set([
  path.join(REPO_ROOT, "database.types.ts"),
  path.resolve(__dirname, "photosUploadedNeverWritten.test.ts"),
]);

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

describe("DamageReports.photos_uploaded is never written by br_driver", () => {
  it("passes the compile-time guard (see PhotosUploadedIsNotLocal above)", () => {
    expect(photosUploadedIsNotLocal).toBe(true);
  });

  it("never appears as a write-payload key in any app source file", () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) {
      const abs = path.join(REPO_ROOT, dir);
      if (fs.existsSync(abs)) collectSourceFiles(abs, files);
    }

    // `photos_uploaded:` catches both an object-literal write key
    // (`.set({ photos_uploaded: ... })`) and a type-literal field — the only
    // place that syntax is legitimate is the excluded types file above.
    const offenders = files
      .filter((f) => !EXCLUDED_FILES.has(f))
      .filter((f) => /photos_uploaded\s*:/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(REPO_ROOT, f));

    expect(offenders).toEqual([]);
  });
});
