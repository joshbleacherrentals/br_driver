/**
 * Acknowledging existing damage reports — the write a driver makes INSTEAD of
 * filing a duplicate.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * Managers were receiving three to five reports about one piece of damage,
 * because every driver who sees it is required to report it. Now the driver is
 * shown the bleacher's open reports first and ticks the ones that describe
 * what they are looking at; this is what that tick writes.
 *
 * A light row, not a report: no photos, no severity, no note — the report it
 * points at already carries all of that. What it adds is the thing the manager
 * was missing: how many drivers have confirmed this, and how recently.
 */

import { db } from "@/library/powersync/db";
import {
  crossDriverWrite,
  type DriverScope,
} from "@/library/powersync/scoping";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";
import { randomUUID } from "expo-crypto";

export type AcknowledgeDamageReportsInput = {
  /** The reports the driver ticked. */
  reportIds: string[];
  /** The inspection this happened during, or null on the standalone path. */
  inspectionUuid: string | null;
  /** The trip it was seen on, when there is one. */
  workTrackerUuid: string | null;
  scope: DriverScope;
};

/**
 * §15 — why none of these queries is scoped to the report's author.
 *
 * The reports being acknowledged belong to other drivers; that is the entire
 * point. Scoping by `created_by_user_uuid` would mean a driver could only
 * confirm their own reports, which is the one case that never needed
 * confirming.
 */
const ACKNOWLEDGING_IS_CROSS_DRIVER =
  "a driver acknowledges damage another driver reported — confirming someone " +
  "else's report is what replaces filing a duplicate";

/** One INSERT per ticked report. Compiled, so tests can run them for real. */
export function buildAcknowledgementInserts(
  input: AcknowledgeDamageReportsInput,
  nowIso: string,
) {
  return input.reportIds.map((reportId) =>
    crossDriverWrite(
      ACKNOWLEDGING_IS_CROSS_DRIVER,
      db.insertInto("DamageReportAcknowledgements").values({
        id: randomUUID(),
        damage_report_uuid: reportId,
        inspection_uuid: input.inspectionUuid,
        work_tracker_uuid: input.workTrackerUuid,
        acknowledged_by_user_uuid: input.scope.userUuid,
        created_at: nowIso,
        deleted: 0,
        // `report_resolved_at` is deliberately absent: it mirrors the parent's
        // `resolved_at`, is maintained by Postgres triggers, and is the column
        // the mobile sync rule filters on. A client writing it would be
        // deciding what reaches other drivers' phones.
      }),
    ).compile(),
  );
}

/**
 * Withdraw the "fixed by driver" claim from every report just acknowledged.
 *
 * Someone said the damage was gone; a driver is looking at it right now. The
 * claim is wrong, and leaving it standing means the manager keeps reading it
 * as the cheap end of their backlog.
 *
 * `fixed_by_driver = 1` in the WHERE is load-bearing, not tidiness: PowerSync
 * records one upload operation per row an UPDATE actually touches, so without
 * it every ticked report would push a no-op change through the queue.
 */
export function buildClearFixedOnAcknowledged(reportIds: string[]) {
  return crossDriverWrite(
    ACKNOWLEDGING_IS_CROSS_DRIVER,
    db
      .updateTable("DamageReports")
      .set({
        fixed_by_driver: 0,
        fixed_at: null,
        fixed_by_user_uuid: null,
      })
      .where("id", "in", reportIds)
      .where("fixed_by_driver", "=", 1),
  ).compile();
}

/**
 * Record the driver's selection.
 *
 * One transaction: a phone that dies between the two writes would otherwise
 * leave a report acknowledged but still advertised as fixed — the exact
 * combination that tells a manager to leave it alone.
 */
export async function acknowledgeDamageReports(
  input: AcknowledgeDamageReportsInput,
): Promise<void> {
  if (input.reportIds.length === 0) return;

  const inserts = buildAcknowledgementInserts(input, new Date().toISOString());
  const clearFixed = buildClearFixedOnAcknowledged(input.reportIds);

  await executeTypedTransaction(async (tx) => {
    for (const insert of inserts) {
      await tx.run(insert);
    }
    await tx.run(clearFixed);
  });
}
