/**
 * The "fixed by driver" mark on a damage report.
 *
 * Spec: docs/specs/driver-fixed-damage-reports.md
 *
 * This is NOT a resolve. It is a driver saying "the damage is gone"; a manager
 * still closes the report on the web, which is also what finally drops it off
 * every driver's phone (mobile sync ships every unresolved report to every
 * device).
 *
 * The three columns move together on purpose. Postgres refuses a half-filled
 * state — `fixed_by_driver` without `fixed_at` and `fixed_by_user_uuid`, or
 * either of those left behind on an unmarked report (CHECK constraint in
 * `20260909120000_damage_reports_fixed_by_driver.sql`). A client that wrote
 * them separately would produce a row that syncs happily and is rejected
 * server-side hours later, offline, with nobody watching.
 */

import { db } from "@/library/powersync/db";
import {
  crossDriverWrite,
  type DriverScope,
} from "@/library/powersync/scoping";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

/**
 * §15 — why neither query below is scoped to the report's author.
 *
 * Whoever was on site is the one who fixed the damage, and that is rarely
 * whoever filed the report. Scoping this by `created_by_user_uuid` would mean
 * the only driver who can say "it's fixed" is the one who is not there.
 *
 * The server does not take the client's word for the blast radius: a driver
 * who tries to change anything but these three columns is rejected by a
 * trigger, and the RLS policy that admits the write at all is UPDATE-only.
 */
const FIXED_MARK_IS_CROSS_DRIVER =
  "any driver may mark a damage report fixed — the driver on site is the one " +
  "who fixed it, not the one who filed the report";

/** Compiled, so it can be exercised directly against a database in tests. */
export function buildMarkFixedQuery(
  damageReportId: string,
  scope: DriverScope,
  fixedAt: string,
) {
  return crossDriverWrite(
    FIXED_MARK_IS_CROSS_DRIVER,
    db
      .updateTable("DamageReports")
      .set({
        fixed_by_driver: 1,
        fixed_at: fixedAt,
        fixed_by_user_uuid: scope.userUuid,
      })
      .where("id", "=", damageReportId),
  ).compile();
}

/** The counterpart — see {@link buildMarkFixedQuery}. */
export function buildUnmarkFixedQuery(damageReportId: string) {
  return crossDriverWrite(
    FIXED_MARK_IS_CROSS_DRIVER,
    db
      .updateTable("DamageReports")
      .set({
        fixed_by_driver: 0,
        fixed_at: null,
        fixed_by_user_uuid: null,
      })
      .where("id", "=", damageReportId),
  ).compile();
}

/**
 * Mark a damage report as fixed by the signed-in driver.
 *
 * Local write only: it lands in the device's database immediately and syncs
 * whenever connectivity returns, so this works with the phone in a field with
 * no signal — which is where the driver actually is when they fix something.
 */
export async function markDamageReportFixed(
  damageReportId: string,
  scope: DriverScope,
): Promise<void> {
  await executeTypedMutationVoid(
    buildMarkFixedQuery(damageReportId, scope, new Date().toISOString()),
  );
}

/** Remove the mark — the "pressed it by accident" path. */
export async function unmarkDamageReportFixed(
  damageReportId: string,
): Promise<void> {
  await executeTypedMutationVoid(buildUnmarkFixedQuery(damageReportId));
}
