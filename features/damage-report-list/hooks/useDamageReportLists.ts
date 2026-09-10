/**
 * The two lists behind the Damage Reports screen's tabs.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * `All` is every open report in the company. That is the change of purpose:
 * the screen used to be a driver's own history, and it is now the place to
 * check whether a bleacher's damage is already known — which is what stops the
 * fourth report about it being written.
 *
 * `Mine` is what this driver filed, and it is where a report whose photos are
 * still stuck can be repaired.
 */

import {
  DamageReportData,
  DAMAGE_REPORT_COLUMNS,
} from "@/hooks/db/useDamageReport";
import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import {
  crossDriverRead,
  damageReportsOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

/**
 * §15 — the All tab is cross-driver on purpose, and that IS the feature: a
 * driver has to see what other drivers reported on a bleacher, or the screen
 * cannot answer "is this already known?".
 */
const OPEN_REPORTS_ARE_SHARED =
  "the All tab exists to show damage other drivers reported — a list of only " +
  "your own reports cannot tell you whether something is already known";

/** Soft-deleted rows still sync; `deleted` is nullable on older rows. */
function notDeleted<Q extends { where: any }>(query: Q): Q {
  return query.where((eb: any) =>
    eb.or([eb("deleted", "=", 0), eb("deleted", "is", null)]),
  );
}

export function buildOpenDamageReportsQuery(bleacherUuid: string | null) {
  let query = db
    .selectFrom("DamageReports")
    .select([...DAMAGE_REPORT_COLUMNS])
    .where("resolved_at", "is", null);

  if (bleacherUuid) query = query.where("bleacher_uuid", "=", bleacherUuid);

  return crossDriverRead(
    OPEN_REPORTS_ARE_SHARED,
    notDeleted(query).orderBy("created_at", "desc"),
  );
}

/**
 * This driver's reports: open ones, plus any whose photos have not finished
 * uploading.
 *
 * The second half is not a nicety. Tabs show unresolved reports only, and this
 * screen is the only route to Retry and Replace — so a report resolved while
 * its photos were still stuck would vanish from the app with the evidence
 * still sitting on the phone and nothing able to reach it.
 *
 * "Not finished" includes a photo with no `PhotoUploadStatus` row at all: the
 * absence of a row is what "pending, never attempted" looks like (§3).
 */
export function buildMyDamageReportsQuery(
  scope: DriverScope,
  bleacherUuid: string | null,
) {
  let query = damageReportsOf(scope).select([...DAMAGE_REPORT_COLUMNS]);

  if (bleacherUuid) query = query.where("bleacher_uuid", "=", bleacherUuid);

  return notDeleted(query)
    .where((eb) =>
      eb.or([
        eb("resolved_at", "is", null),
        eb.exists(
          eb
            // §15: constrained to photos of the row this query has already
            // scoped to the signed-in driver, and read-only — it decides
            // whether a report stays visible, nothing more.
            // eslint-disable-next-line no-restricted-syntax -- §15 scoped by the parent row
            .selectFrom("DamageReportPhotos as p")
            .select("p.id")
            .leftJoin("PhotoUploadStatus as s", "s.id", "p.id")
            .whereRef("p.damage_report_uuid", "=", "DamageReports.id")
            .where((inner) =>
              inner.or([
                inner("s.upload_status", "is", null),
                inner("s.upload_status", "!=", "uploaded"),
              ]),
            ),
        ),
      ]),
    )
    .orderBy("created_at", "desc");
}

export function useOpenDamageReports(bleacherUuid: string | null): {
  damageReports: DamageReportData[];
  isLoading: boolean;
} {
  const compiled = useMemo(
    () => buildOpenDamageReportsQuery(bleacherUuid).compile(),
    [bleacherUuid],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<DamageReportData>());

  return { damageReports: data ?? [], isLoading };
}

export function useMyDamageReportsList(bleacherUuid: string | null): {
  damageReports: DamageReportData[];
  isLoading: boolean;
} {
  const scope = useDriverScope();

  const compiled = useMemo(
    () => (scope ? buildMyDamageReportsQuery(scope, bleacherUuid).compile() : null),
    [scope, bleacherUuid],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<DamageReportData>());

  return {
    damageReports: data ?? [],
    // A query that has not been built yet has not finished loading either.
    isLoading: isLoading || !scope,
  };
}
