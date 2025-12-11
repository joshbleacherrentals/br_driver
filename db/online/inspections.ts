import { InspectionData, WorkTrackerInspection } from "@/types/inspection";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a new inspection record
 */
export async function createInspection(
  supabase: SupabaseClient,
  inspectionData: InspectionData
): Promise<WorkTrackerInspection> {
  const { data, error } = await supabase
    .from("WorkTrackerInspections")
    .insert(inspectionData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Link pre-trip inspection to work tracker
 */
export async function linkPreTripInspection(
  supabase: SupabaseClient,
  workTrackerId: number,
  inspectionId: number
): Promise<void> {
  const { error } = await supabase
    .from("WorkTrackers")
    .update({ pre_inspection_id: inspectionId })
    .eq("work_tracker_id", workTrackerId);

  if (error) throw error;
}

/**
 * Link post-trip inspection to work tracker
 */
export async function linkPostTripInspection(
  supabase: SupabaseClient,
  workTrackerId: number,
  inspectionId: number
): Promise<void> {
  const { error } = await supabase
    .from("WorkTrackers")
    .update({ post_inspection_id: inspectionId })
    .eq("work_tracker_id", workTrackerId);

  if (error) throw error;
}

/**
 * Create and link pre-trip inspection in one transaction
 */
export async function createAndLinkPreTripInspection(
  supabase: SupabaseClient,
  workTrackerId: number,
  inspectionData: InspectionData
): Promise<WorkTrackerInspection> {
  const inspection = await createInspection(supabase, inspectionData);
  await linkPreTripInspection(supabase, workTrackerId, inspection.inspection_id);
  return inspection;
}

/**
 * Create and link post-trip inspection in one transaction
 */
export async function createAndLinkPostTripInspection(
  supabase: SupabaseClient,
  workTrackerId: number,
  inspectionData: InspectionData
): Promise<WorkTrackerInspection> {
  const inspection = await createInspection(supabase, inspectionData);
  await linkPostTripInspection(supabase, workTrackerId, inspection.inspection_id);
  return inspection;
}

/**
 * Get inspection by ID
 */
export async function getInspection(
  supabase: SupabaseClient,
  inspectionId: number
): Promise<WorkTrackerInspection | null> {
  const { data, error } = await supabase
    .from("WorkTrackerInspections")
    .select("*")
    .eq("inspection_id", inspectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }
  return data;
}
