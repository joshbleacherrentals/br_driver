/**
 * The most recent annual inspection on record for one bleacher.
 *
 * "Most recent" is by due date, not by row order: a bleacher accumulates one
 * row per year, and the only one a driver cares about is the one that governs
 * today. Sorting in SQL keeps the whole history off the JS side.
 */

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

/**
 * Written flat rather than as an intersection with `AnnualInspectionRecord`:
 * `useTypedQuery` compares the query's row type for exact equality, and an
 * intersection is not the same type as the object it flattens to.
 */
type InspectionRow = {
  id: string;
  document_path: string | null;
  inspected_on: string | null;
  next_due_on: string | null;
};

export type BleacherAnnualInspection = InspectionRow;

export function useBleacherAnnualInspection(
  bleacherId: string | null,
): BleacherAnnualInspection | null {
  const compiled = useMemo(() => {
    if (!bleacherId) return null;

    return db
      .selectFrom("BleacherAnnualInspections")
      .select(["id", "document_path", "inspected_on", "next_due_on"])
      .where("bleacher_uuid", "=", bleacherId)
      .orderBy("next_due_on", "desc")
      .limit(1)
      .compile();
  }, [bleacherId]);

  const result = useTypedQuery(compiled, expect<InspectionRow>());
  return result.data?.[0] ?? null;
}
