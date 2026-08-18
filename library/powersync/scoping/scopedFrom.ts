/**
 * §15 — already-scoped query sources.
 *
 * This is the layer the whole scoping design rests on. Every read of a table
 * that syncs other drivers' rows starts here, from a builder that *already*
 * carries its ownership predicate, instead of from a bare
 * `db.selectFrom("DamageReportPhotos")` that each caller then has to remember to
 * filter. Forgetting to scope stops being a thing you can do by omission: there
 * is no unscoped entry point to omit the filter from, and an ESLint rule
 * (`no-restricted-syntax` in `eslint.config.js`) stops a new `selectFrom` on
 * these tables being opened anywhere but here.
 *
 * Each function takes a `DriverScope` — the branded type from `driverScope.ts`,
 * which only `publishDriverScope` can mint — so "scope this by the id in the
 * route param" is not expressible either.
 *
 * The functions return plain Kysely builders. Callers add their own
 * `.select(...)`, `.where(...)`, `.orderBy(...)` on top exactly as before; the
 * ownership predicate is an `EXISTS`, so it never collides with a bare-column
 * filter or forces a column to be re-qualified (see `ownership.ts`).
 */

import { db } from "@/library/powersync/db";

import type { DriverScope } from "./driverScope";
import {
  damageReportOwnedBy,
  damageReportPhotoOwnedBy,
  inspectionOwnedBy,
  inspectionPhotoOwnedBy,
} from "./ownership";

/** `DamageReports` this driver created. */
export function damageReportsOf(scope: DriverScope) {
  return db
    .selectFrom("DamageReports")
    .where((eb) => damageReportOwnedBy(eb, scope));
}

/** `DamageReportPhotos` hanging off a report this driver created. */
export function damageReportPhotosOf(scope: DriverScope) {
  return db
    .selectFrom("DamageReportPhotos")
    .where((eb) => damageReportPhotoOwnedBy(eb, scope));
}

/** `WorkTrackerInspections` that are a leg of one of this driver's trips. */
export function inspectionsOf(scope: DriverScope) {
  return db
    .selectFrom("WorkTrackerInspections")
    .where((eb) => inspectionOwnedBy(eb, scope));
}

/** `InspectionPhotos` hanging off an inspection on one of this driver's trips. */
export function inspectionPhotosOf(scope: DriverScope) {
  return db
    .selectFrom("InspectionPhotos")
    .where((eb) => inspectionPhotoOwnedBy(eb, scope));
}

/**
 * `DriverDocuments`, unscoped — and named so, rather than merely absent.
 *
 * §15: this table's Postgres RLS is already owner-scoped server-side, so a
 * device never holds another driver's documents and there is nothing for a
 * client-side filter to remove. Routing it through this module anyway keeps
 * every photo table's source in one file, and makes the lack of a predicate a
 * decision someone wrote down rather than one someone forgot.
 */
export function driverDocumentsAll() {
  return db.selectFrom("DriverDocuments");
}

/**
 * An explicit, greppable opt-out for reads that are cross-driver *by design*.
 *
 * Identity at runtime — it compiles to nothing. Its entire value is that the
 * call site has to name a reason, so "this query has no ownership filter"
 * reads as a decision rather than an oversight, and `grep crossDriverRead`
 * enumerates every one of them.
 *
 * The legitimate case today is bleacher damage: a driver hauling a bleacher
 * needs to see damage another driver reported on it.
 */
export function crossDriverRead<Q>(reason: string, query: Q): Q {
  void reason;
  return query;
}
