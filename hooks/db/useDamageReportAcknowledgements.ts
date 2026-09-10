/**
 * Reading damage report acknowledgements.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * An acknowledgement is a driver saying "I see this one too" about a report
 * someone else filed, written instead of a duplicate. These are the two reads
 * that make it worth writing:
 *
 * - `useAckCounts` — "confirmed by N drivers" on a report card, which is what
 *   persuades the reader that the damage is known and does not need reporting
 *   again;
 * - `useAcksForInspection` — what a given inspection already confirmed, so an
 *   inspection summary can show the damage it recorded rather than an empty
 *   card, and so a re-opened inspection does not count twice.
 */

import { db } from "@/library/powersync/db";
import { crossDriverRead } from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

/**
 * §15 — why these are not driver-scoped.
 *
 * A count of confirmations that only counts your own confirmations reads `0`
 * on precisely the reports that other drivers have already confirmed, which
 * inverts the meaning of the line it feeds. The rows are cross-driver for the
 * same reason the damage reports themselves are: the damage belongs to the
 * bleacher, not to whoever wrote about it.
 */
const ACKNOWLEDGEMENTS_ARE_SHARED =
  "acknowledgements are counted across drivers — the point of the count is " +
  "that other people have already confirmed this damage";

export type AckCountRow = {
  damage_report_uuid: string | null;
  count: number;
};

export type AckRow = {
  id: string;
  // Nullable in the schema, like every synced foreign key on this device.
  damage_report_uuid: string | null;
  acknowledged_by_user_uuid: string | null;
  created_at: string | null;
};

/**
 * `null` for an empty selection rather than a query matching nothing: there is
 * no question to ask, and `useTypedQuery` already treats `null` as "not ready".
 */
export function buildAckCountsQuery(damageReportIds: string[]) {
  if (damageReportIds.length === 0) return null;

  return crossDriverRead(
    ACKNOWLEDGEMENTS_ARE_SHARED,
    db
      .selectFrom("DamageReportAcknowledgements")
      .select((eb) => [
        "damage_report_uuid",
        eb.fn.countAll<number>().as("count"),
      ])
      .where("damage_report_uuid", "in", damageReportIds)
      .where("deleted", "=", 0)
      .groupBy("damage_report_uuid")
      .orderBy("damage_report_uuid"),
  );
}

/** How many drivers have confirmed each of these reports. */
export function useAckCounts(damageReportIds: string[]): {
  counts: Record<string, number>;
  isLoading: boolean;
} {
  // The ids arrive from a list render, so a new array identity every frame is
  // the norm; the join is what keeps the query from being rebuilt each time.
  const key = damageReportIds.join(",");

  const compiled = useMemo(
    () => buildAckCountsQuery(key ? key.split(",") : [])?.compile() ?? null,
    [key],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<AckCountRow>());

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.damage_report_uuid) result[row.damage_report_uuid] = row.count;
    }
    return result;
  }, [data]);

  return { counts, isLoading };
}

export function buildAcksForInspectionQuery(inspectionUuid: string | null | undefined) {
  if (!inspectionUuid) return null;

  return crossDriverRead(
    ACKNOWLEDGEMENTS_ARE_SHARED,
    db
      .selectFrom("DamageReportAcknowledgements")
      .select(["id", "damage_report_uuid", "acknowledged_by_user_uuid", "created_at"])
      .where("inspection_uuid", "=", inspectionUuid)
      .where("deleted", "=", 0)
      .orderBy("created_at", "asc"),
  );
}

/** The reports this inspection confirmed instead of duplicating. */
export function useAcksForInspection(inspectionUuid: string | null | undefined): {
  acks: AckRow[];
  isLoading: boolean;
} {
  const compiled = useMemo(
    () => buildAcksForInspectionQuery(inspectionUuid)?.compile() ?? null,
    [inspectionUuid],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<AckRow>());

  return { acks: data ?? [], isLoading };
}
