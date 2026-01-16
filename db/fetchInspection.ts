import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";


export type InspectionData = {
    created_at: string | null;
    walk_around_complete: number | null;
    issues_found: number | null;
    issue_description: string | null;
};

export type InspectionPhotosData = {
    created_at: string | null;
    inspection_id: string | null;
    storage_path: string | null;
    caption: string | null;
}

/**
 * Fetch Inspections belonging to the inspection_id
 */
export function fetchInspection(inspection_id: string | null): { inspection: InspectionData | null } {

  // 1. Get user_id from Users table
  const compiled = useMemo(() => {
    if (!inspection_id) return null;

    return db
    .selectFrom("WorkTrackerInspections")
    .select([
        "created_at",
        "walk_around_complete",
        "issues_found",
        "issue_description",
    ])
    .where("id", "=", inspection_id)
    .limit(1)
    .compile();
  }, [inspection_id]);
  
  const inspectionData = useTypedQuery(compiled, expect<InspectionData>());

  return { inspection: inspectionData.data?.[0] ?? null };
}