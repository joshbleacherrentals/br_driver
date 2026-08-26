/**
 * §15 — the ownership predicates, in one place.
 *
 * These are the only expressions in the app that say what "this driver's row"
 * means. `scopedFrom.ts` is their only intended consumer; everything else gets
 * ownership by starting from a scoped source rather than by repeating a filter.
 *
 * Both photo predicates are `WHERE EXISTS` rather than an `INNER JOIN`,
 * deliberately:
 *
 *   1. They compose with existing queries without touching a single
 *      `.select([...])`, `.orderBy(...)` or bare-column `.where(...)`. A join
 *      would force every one of those columns to be re-qualified, turning a
 *      scoping change into a rewrite of every query it touches.
 *   2. `EXISTS` cannot multiply the outer row set. That is load-bearing for
 *      `InspectionPhotos`: the path to `WorkTrackers` is an OR over
 *      `pre_inspection_uuid`/`post_inspection_uuid`, and nothing in the schema
 *      makes it 1:1 — `WorkTrackerInspections` has no foreign key back to
 *      `WorkTrackers`, the reference runs the other way. An inspection id
 *      matched by two `WorkTrackers` rows would, under a join, duplicate its
 *      photo inside every candidate batch and every list result. `EXISTS`
 *      answers yes-or-no, once.
 *
 * A NULL creator/driver needs no special case: SQL equality against NULL is
 * never true, so an unattributed row simply fails the predicate. §15 wants
 * exactly that — a photo nobody owns is a photo no driver's queue should be
 * spending attempts on, and no driver's screen should be showing.
 *
 * **On the types.** Each predicate declares the single table it reads, not the
 * caller's whole table union — `damageReportOwnedBy` says `"DamageReports"`
 * even though it is also used inside `damageReportPhotoOwnedBy`'s correlated
 * subquery, where Kysely's `ExpressionBuilder` carries a strictly wider union.
 * That works because the wider builder satisfies the narrower parameter, and
 * because what comes back is a plain `Expression<SqlBool>`, which carries no
 * table union at all. Making them generic over the caller's union instead is
 * what does *not* work: Kysely resolves `"Table.column"` references through a
 * mapped type over the table union, which it cannot evaluate while that union
 * is still an unresolved type parameter, so every column reference inside would
 * fail to typecheck.
 */

import type { ExpressionBuilder } from "kysely";

import type { PowerSyncDB } from "@/library/powersync/AppSchema";

import type { DriverScope } from "./driverScope";

/**
 * A `DamageReports` row this driver created.
 *
 * The flat half of report ownership, shared by `damageReportsOf` (which applies
 * it to the reports themselves) and by `damageReportPhotoOwnedBy` below (which
 * applies it to the report behind a photo), so the two can never drift.
 */
export function damageReportOwnedBy(
  eb: ExpressionBuilder<PowerSyncDB, "DamageReports">,
  scope: DriverScope,
) {
  return eb("DamageReports.created_by_user_uuid", "=", scope.userUuid);
}

/**
 * A `RoadmapTasks` row this driver filed as a backlog ticket.
 *
 * Unlike the photo tables, this one syncs owner-scoped already (the mobile
 * stream joins through `created_by_user_uuid`). The predicate exists anyway:
 * `RoadmapTasks` is the developers' entire board in Postgres, so "a driver only
 * ever reads and rewrites their own ticket" is a guarantee that should hold in
 * the statement rather than only in a sync rule one config change away from
 * being wider. `is_backlog` is part of ownership here for the same reason — a
 * task pulled into a sprint is no longer the driver's to see through this
 * feature.
 */
export function backlogTicketOwnedBy(
  eb: ExpressionBuilder<PowerSyncDB, "RoadmapTasks">,
  scope: DriverScope,
) {
  return eb.and([
    eb("RoadmapTasks.created_by_user_uuid", "=", scope.userUuid),
    eb("RoadmapTasks.is_backlog", "=", 1),
  ]);
}

/** A `DamageReportPhotos` row whose report this driver created. */
export function damageReportPhotoOwnedBy(
  eb: ExpressionBuilder<PowerSyncDB, "DamageReportPhotos">,
  scope: DriverScope,
) {
  return eb.exists(
    eb
      .selectFrom("DamageReports")
      .select("DamageReports.id")
      .whereRef(
        "DamageReports.id",
        "=",
        "DamageReportPhotos.damage_report_uuid",
      )
      .where((inner) => damageReportOwnedBy(inner, scope)),
  );
}

/**
 * A `WorkTrackerInspections` row that is a leg of one of this driver's trips.
 *
 * A trip has a pickup inspection and a dropoff inspection, so both legs count
 * and both are walked.
 */
export function inspectionOwnedBy(
  eb: ExpressionBuilder<PowerSyncDB, "WorkTrackerInspections">,
  scope: DriverScope,
) {
  return eb.exists(
    eb
      .selectFrom("WorkTrackers")
      .select("WorkTrackers.id")
      .where((inner) =>
        inner.or([
          inner(
            "WorkTrackers.pre_inspection_uuid",
            "=",
            inner.ref("WorkTrackerInspections.id"),
          ),
          inner(
            "WorkTrackers.post_inspection_uuid",
            "=",
            inner.ref("WorkTrackerInspections.id"),
          ),
        ]),
      )
      .where("WorkTrackers.driver_uuid", "=", scope.driverUuid),
  );
}

/** An `InspectionPhotos` row whose inspection is a leg of this driver's trip. */
export function inspectionPhotoOwnedBy(
  eb: ExpressionBuilder<PowerSyncDB, "InspectionPhotos">,
  scope: DriverScope,
) {
  return eb.exists(
    eb
      .selectFrom("WorkTrackerInspections")
      .select("WorkTrackerInspections.id")
      .whereRef(
        "WorkTrackerInspections.id",
        "=",
        "InspectionPhotos.inspection_uuid",
      )
      .where((inner) => inspectionOwnedBy(inner, scope)),
  );
}
