import { Database } from "@/database.types";
import { WorkTrackerStatus } from "@/types/workTracker";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Update work tracker status
 * Direct Supabase update - use with React Query mutation
 */
export async function updateWorkTrackerStatus(
  supabase: SupabaseClient<Database>,
  workTrackerId: number,
  newStatus: WorkTrackerStatus
): Promise<void> {
  const { error } = await supabase
    .from("WorkTrackers")
    .update({ status: newStatus })
    .eq("work_tracker_id", workTrackerId);

  if (error) {
    console.error("Failed to update work tracker status:", error);
    throw error;
  }
}

/**
 * Accept a released trip
 */
export async function acceptTrip(
  supabase: SupabaseClient<Database>,
  workTrackerId: number
): Promise<void> {
  return updateWorkTrackerStatus(supabase, workTrackerId, "accepted");
}

/**
 * Start an accepted trip (enter trip mode)
 */
export async function startTrip(
  supabase: SupabaseClient<Database>,
  workTrackerId: number
): Promise<void> {
  return updateWorkTrackerStatus(supabase, workTrackerId, "in_progress");
}

/**
 * Complete a trip
 */
export async function completeTrip(
  supabase: SupabaseClient<Database>,
  workTrackerId: number
): Promise<void> {
  return updateWorkTrackerStatus(supabase, workTrackerId, "completed");
}

/**
 * Cancel a trip
 */
export async function cancelTrip(
  supabase: SupabaseClient<Database>,
  workTrackerId: number
): Promise<void> {
  return updateWorkTrackerStatus(supabase, workTrackerId, "cancelled");
}
