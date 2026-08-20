import { useDriverScope } from "@/hooks/useDriverScope";
import {
  inspectionPhotosOf,
  inspectionsOf,
  type DriverScope,
} from "@/library/powersync/scoping";
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
    /** Custom upload queue (design doc §3). */
    upload_status: string | null;
    /** `LOCAL_FILE_MISSING` means the row is parked — Retry can do nothing. */
    last_error: string | null;
}

/**
 * The query behind `useInspection`, exported separately so it can be exercised
 * directly against a database in tests.
 *
 * §15 — built from `inspectionsOf(scope)`, which walks
 * `WorkTrackers.pre_inspection_uuid`/`post_inspection_uuid` back to
 * `driver_uuid`. An inspection id alone is no longer enough to read a row.
 */
export function buildInspectionQuery(
  scope: DriverScope,
  inspection_id: string,
) {
  return inspectionsOf(scope)
    .select([
      "id",
      "created_at",
      "walk_around_complete",
      "issues_found",
      "issue_description",
      "answers_json",
    ])
    .where("id", "=", inspection_id)
    .limit(1);
}

/**
 * Fetch the inspection with this id, if it belongs to the signed-in driver.
 */
export function useInspection(inspection_id: string | null): { inspection: InspectionData | null } {
  const scope = useDriverScope();

  const compiled = useMemo(
    () =>
      scope && inspection_id
        ? buildInspectionQuery(scope, inspection_id).compile()
        : null,
    [scope, inspection_id],
  );

  const inspectionData = useTypedQuery(compiled, expect<InspectionData>());

  return { inspection: inspectionData.data?.[0] ?? null };
}

/**
 * The query behind `useInspectionPhotos`, exported separately for the same
 * reason as `buildInspectionQuery` above.
 *
 * §15 — built from `inspectionPhotosOf(scope)`, so it walks
 * `InspectionPhotos.inspection_uuid → WorkTrackerInspections.id →
 * WorkTrackers.driver_uuid` exactly as the upload queue's adapter does.
 * `InspectionPhotos` syncs every driver's rows to every device, and
 * `InspectionPhotoRepair` feeds whatever `inspectionUuid` prop it is given
 * straight into this hook, whose result flows into `usePhotoRepair`'s
 * Retry/Replace mutations.
 */
export function buildInspectionPhotosQuery(
  scope: DriverScope,
  inspection_id: string,
) {
  return inspectionPhotosOf(scope)
    .select([
      "id",
      "created_at",
      "inspection_uuid",
      "storage_path",
      "caption",
      "upload_status",
      "last_error",
    ])
    .where("inspection_uuid", "=", inspection_id)
    .orderBy("created_at", "asc");
}

export function useInspectionPhotos(inspection_id: string | null): { Photos: InspectionPhotosData[] | null } {
  const scope = useDriverScope();

  const compiledPhotos = useMemo(
    () =>
      scope && inspection_id
        ? buildInspectionPhotosQuery(scope, inspection_id).compile()
        : null,
    [scope, inspection_id],
  );

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
