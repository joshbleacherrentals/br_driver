import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";


export type InspectionData = {
    id: string;
    created_at: string | null;
    walk_around_complete: number | null;
    issues_found: number | null;
    issue_description: string | null;
};

export type InspectionPhotosData = {
    id: string;
    created_at: string | null;
    inspection_uuid: string | null;
    storage_path: string | null;
    caption: string | null;
}

/**
 * Fetch Inspections belonging to the inspection_id
 */
export function fetchInspection(inspection_id: string | null): { inspection: InspectionData | null } {

  const compiled = useMemo(() => {
    if (!inspection_id) return null;

    return db
    .selectFrom("WorkTrackerInspections")
    .select([
      "id",
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

export function fetchInspectionPhotos(inspection_id: string | null): { Photos: InspectionPhotosData[] | null } {

  const compiledPhotos = useMemo(() => {
    if (!inspection_id) return null;

    return db
    .selectFrom("InspectionPhotos")
    .select([
        "id",
        "created_at",
        "inspection_uuid",
        "storage_path",
        "caption"
    ])
    .where("inspection_uuid", "=", inspection_id)
    .orderBy("created_at", "asc")
    .compile();
  }, [inspection_id]);
  
  const photosData = useTypedQuery(compiledPhotos, expect<InspectionPhotosData>());

  return { Photos: photosData.data };
}