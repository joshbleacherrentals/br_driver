/**
 * What an inspection writes about the damage the driver reported.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * One place, because there are now two possible outcomes of `damage = yes` and
 * they can happen together: a new report for what nobody has described yet, and
 * acknowledgements for what is already open on the bleacher. The screen that
 * calls this is a thousand lines of camera, filesystem and transaction
 * handling; the decision about what ends up in the database should not be
 * buried in the middle of it.
 *
 * Runs AFTER the inspection row and its work-tracker link are committed —
 * acknowledgements need the inspection's id, and both writes here are additive
 * to a trip record that already exists.
 */

import { acknowledgeDamageReports } from "@/features/damage-report/utils/acknowledgeDamageReports";
import {
  commitDamageReport,
  type CreateDamageReportResult,
  type DamageReportFields,
} from "@/features/damage-report/utils/createDamageReport";
import type { DamageReportDraft } from "@/features/damage-report/utils/prepareDamageReportPhotos";
import type { DriverScope } from "@/library/powersync/scoping";

export type CommitInspectionDamageInput = {
  /** Prepared photos for a new report, or null when nothing new was filed. */
  draft: DamageReportDraft | null;
  fields: DamageReportFields;
  /** Existing reports the driver ticked as describing what they see. */
  acknowledgedIds: string[];
  inspectionUuid: string;
  workTrackerUuid: string;
  scope: DriverScope;
};

/**
 * Returns the report result when one was filed, so the caller can still tell
 * the driver about a partial photo save; `null` when the driver only ticked.
 */
export async function commitInspectionDamage(
  input: CommitInspectionDamageInput,
): Promise<CreateDamageReportResult | null> {
  const result = input.draft
    ? await commitDamageReport(input.draft, input.fields)
    : null;

  if (input.acknowledgedIds.length > 0) {
    try {
      await acknowledgeDamageReports({
        reportIds: input.acknowledgedIds,
        inspectionUuid: input.inspectionUuid,
        workTrackerUuid: input.workTrackerUuid,
        scope: input.scope,
      });
    } catch (error) {
      // Deliberately swallowed. The inspection is already committed by now, and
      // an acknowledgement is a count on someone else's report — losing one is
      // not worth an error dialog on a submitted inspection, and the driver has
      // no action to take in response to it either.
      console.error("[Inspection] acknowledging damage failed:", error);
    }
  }

  return result;
}
