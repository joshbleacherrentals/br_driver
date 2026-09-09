/**
 * The bleacher picker on the Damage Reports screen.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * With `All` showing every open report in the company, scrolling to find one
 * bleacher stops being possible — so each tab gets a picker, fed by the
 * bleachers that actually have something open on them. Offering the full
 * bleacher list instead would mostly offer choices that lead to an empty
 * screen.
 */

import { useBatchBleachers } from "@/hooks/db/useBleacher";
import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import {
  crossDriverRead,
  damageReportsOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

const OPEN_REPORTS_ARE_SHARED =
  "the All tab's picker lists bleachers other drivers reported damage on — " +
  "that is what the tab is for";

export type BleacherOption = {
  id: string;
  /** `Bleachers.bleacher_number` is text in the schema, digits in practice. */
  bleacherNumber: string | null;
  openReports: number;
};

type BleacherCountRow = { bleacher_uuid: string | null; count: number };

/** One row per bleacher, not per report — the picker lists bleachers. */
export function buildBleachersWithOpenReportsQuery() {
  return crossDriverRead(
    OPEN_REPORTS_ARE_SHARED,
    db
      .selectFrom("DamageReports")
      .select((eb) => ["bleacher_uuid", eb.fn.countAll<number>().as("count")])
      .where("resolved_at", "is", null)
      .where("bleacher_uuid", "is not", null)
      .where((eb) => eb.or([eb("deleted", "=", 0), eb("deleted", "is", null)]))
      .groupBy("bleacher_uuid")
      .orderBy("bleacher_uuid"),
  );
}

export function buildMyBleachersWithOpenReportsQuery(scope: DriverScope) {
  return damageReportsOf(scope)
    .select((eb) => ["bleacher_uuid", eb.fn.countAll<number>().as("count")])
    .where("resolved_at", "is", null)
    .where("bleacher_uuid", "is not", null)
    .where((eb) => eb.or([eb("deleted", "=", 0), eb("deleted", "is", null)]))
    .groupBy("bleacher_uuid")
    .orderBy("bleacher_uuid");
}

/**
 * Bleacher options for both tabs, with their numbers resolved for display.
 *
 * `mine` is a separate query rather than a filter over `all`, because the two
 * tabs ask different questions and a driver with no reports of their own must
 * get an empty picker, not the whole company's.
 */
export function useBleachersWithOpenReports(): {
  all: BleacherOption[];
  mine: BleacherOption[];
} {
  const scope = useDriverScope();

  const allCompiled = useMemo(
    () => buildBleachersWithOpenReportsQuery().compile(),
    [],
  );
  const mineCompiled = useMemo(
    () => (scope ? buildMyBleachersWithOpenReportsQuery(scope).compile() : null),
    [scope],
  );

  const { data: allRows } = useTypedQuery(allCompiled, expect<BleacherCountRow>());
  const { data: mineRows } = useTypedQuery(mineCompiled, expect<BleacherCountRow>());

  const ids = useMemo(() => {
    const seen = new Set<string>();
    for (const row of [...(allRows ?? []), ...(mineRows ?? [])]) {
      if (row.bleacher_uuid) seen.add(row.bleacher_uuid);
    }
    return [...seen];
  }, [allRows, mineRows]);

  const bleachersById = useBatchBleachers(ids);

  return useMemo(() => {
    const numbers = new Map<string, string | null>(
      Object.entries(bleachersById).map(([id, bleacher]) => [
        id,
        bleacher?.bleacher_number ?? null,
      ]),
    );

    const toOptions = (rows: BleacherCountRow[] | undefined): BleacherOption[] =>
      (rows ?? [])
        .filter((row): row is BleacherCountRow & { bleacher_uuid: string } =>
          !!row.bleacher_uuid,
        )
        .map((row) => ({
          id: row.bleacher_uuid,
          bleacherNumber: numbers.get(row.bleacher_uuid) ?? null,
          openReports: row.count,
        }))
        // By bleacher number, since that is what the driver reads. The column
        // is text, so this parses; unknown numbers sort last rather than at the
        // top pretending to be zero.
        .sort(
          (a, b) =>
            (a.bleacherNumber ? Number(a.bleacherNumber) : Infinity) -
            (b.bleacherNumber ? Number(b.bleacherNumber) : Infinity),
        );

    return { all: toOptions(allRows), mine: toOptions(mineRows) };
  }, [allRows, mineRows, bleachersById]);
}
