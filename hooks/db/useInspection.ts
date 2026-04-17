import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";


export type InspectionData = {
    id: string;
    created_at: string | null;
    walk_around_complete: number | null;
    issues_found: number | null;
    issue_description: string | null;
    answers_json: string | null;
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
export function useInspection(inspection_id: string | null): { inspection: InspectionData | null } {

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
      "answers_json"
    ])
    .where("id", "=", inspection_id)
    .limit(1)
    .compile();
  }, [inspection_id]);
  
  const inspectionData = useTypedQuery(compiled, expect<InspectionData>());

  return { inspection: inspectionData.data?.[0] ?? null };
}

export function useInspectionPhotos(inspection_id: string | null): { Photos: InspectionPhotosData[] | null } {

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

// Shared type for a parsed answer entry
export type ParsedAnswer = {
  question_text: string;
  question_type: 'text' | 'checkbox' | 'photo';
  required: boolean;
  answer_text?: string | null;
  answer_boolean?: boolean | null;
  photos?: { storage_path: string }[];
};

export function parseInspectionAnswers(answers_json: string | null): ParsedAnswer[] {
  if (!answers_json) return [];
  try {
    const map = JSON.parse(answers_json) as Record<string, ParsedAnswer>;
    return Object.values(map);
  } catch {
    return [];
  }
}