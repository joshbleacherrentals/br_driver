import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DamageReportData = {
  id: string;
  inspection_uuid: string | null;
  bleacher_uuid: string | null;
  is_safe_to_sit: number | null; 
  is_safe_to_haul: number | null;
  note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  maintenance_event_uuid: string | null;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the most-recent **unresolved** damage report for a given bleacher,
 * or `null` if the bleacher is damage-free (or the id is unknown).
 *
 * "Unresolved" means `resolved_at IS NULL`.
 */
export function useDamageReport(bleacher_uuid: string | null | undefined): {
  damageReport: DamageReportData | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!bleacher_uuid) return null;

    return db
      .selectFrom("DamageReports")
      .select([
        "id",
        "inspection_uuid",
        "bleacher_uuid",
        "is_safe_to_sit",
        "is_safe_to_haul",
        "note",
        "created_at",
        "resolved_at",
        "maintenance_event_uuid",
      ])
      .where("bleacher_uuid", "=", bleacher_uuid)
      .where("resolved_at", "is", null)
      .orderBy("created_at", "desc")
      .limit(1)
      .compile();
  }, [bleacher_uuid]);

  const { data, isLoading } = useTypedQuery(compiled, expect<DamageReportData>());

  return {
    damageReport: data?.[0] ?? null,
    isLoading,
  };
}

/**
 * Returns ALL unresolved damage reports for a given bleacher,
 * ordered newest-first.
 */
export function useDamageReports(bleacher_uuid: string | null | undefined): {
  damageReports: DamageReportData[];
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!bleacher_uuid) return null;

    return db
      .selectFrom("DamageReports")
      .select([
        "id",
        "inspection_uuid",
        "bleacher_uuid",
        "is_safe_to_sit",
        "is_safe_to_haul",
        "note",
        "created_at",
        "resolved_at",
        "maintenance_event_uuid",
      ])
      .where("bleacher_uuid", "=", bleacher_uuid)
      .where("resolved_at", "is", null)
      .orderBy("created_at", "desc")
      .compile();
  }, [bleacher_uuid]);

  const { data, isLoading } = useTypedQuery(compiled, expect<DamageReportData>());

  return {
    damageReports: data ?? [],
    isLoading,
  };
}

/**
 * Returns the damage report tied to a specific inspection,
 * for use in inspection summaries.
 */
export function useDamageReportByInspection(inspection_uuid: string | null | undefined): {
  damageReport: DamageReportData | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!inspection_uuid) return null;

    return db
      .selectFrom("DamageReports")
      .select([
        "id",
        "inspection_uuid",
        "bleacher_uuid",
        "is_safe_to_sit",
        "is_safe_to_haul",
        "note",
        "created_at",
        "resolved_at",
        "maintenance_event_uuid",
      ])
      .where("inspection_uuid", "=", inspection_uuid)
      .orderBy("created_at", "desc")
      .limit(1)
      .compile();
  }, [inspection_uuid]);

  const { data, isLoading } = useTypedQuery(compiled, expect<DamageReportData>());

  return {
    damageReport: data?.[0] ?? null,
    isLoading,
  };
}