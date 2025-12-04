import { Database } from "@/database.types";
import { Address, Bleacher, EnrichedWorkTracker, WorkTracker } from "@/types/workTracker";
import { SupabaseClient } from "@supabase/supabase-js";

export type { Address, Bleacher, EnrichedWorkTracker, WorkTracker };
export type FetchWorkTrackersResult = { workTrackers: EnrichedWorkTracker[] | null };

/**
 * Fetch WorkTrackers belonging to the Clerk user (by clerk_user_id) and enrich with addresses & bleacher number.
 * Excludes draft work trackers (only visible to account managers)
 */
export async function fetchWorkTrackersForClerkUser(
  supabase: SupabaseClient<Database>,
  clerkUserId: string | undefined | null
): Promise<FetchWorkTrackersResult> {
  if (!clerkUserId) return { workTrackers: null };

  // 1. Resolve internal user_id from Users table via clerk_user_id
  const { data: userRow, error: userError } = await supabase
    .from("Users")
    .select("user_id")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (userError || !userRow) {
    console.warn("No matching user for clerk id", clerkUserId, userError?.message);
    return { workTrackers: [] };
  }
  const userId = userRow.user_id;

  // 2. Fetch trackers for this user, excluding drafts
  const { data: trackers, error: trackersError } = await supabase
    .from("WorkTrackers")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "draft") // Exclude drafts
    .order("date", { ascending: true });

  if (trackersError) {
    console.warn("Failed to fetch WorkTrackers", trackersError.message);
    return { workTrackers: null };
  }

  const list = (trackers as unknown as WorkTracker[]) || [];
  if (list.length === 0) return { workTrackers: [] };

  // 3. Gather unique related ids
  const pickupIds = new Set<number>();
  const dropoffIds = new Set<number>();
  const bleacherIds = new Set<number>();
  for (const t of list) {
    if (t.pickup_address_id) pickupIds.add(t.pickup_address_id);
    if (t.dropoff_address_id) dropoffIds.add(t.dropoff_address_id);
    if (t.bleacher_id) bleacherIds.add(t.bleacher_id);
  }

  // 4. Fetch related tables in parallel (only if needed)
  const [pickupAddressesRes, dropoffAddressesRes, bleachersRes] = await Promise.all([
    pickupIds.size
      ? supabase.from("Addresses").select("*").in("address_id", Array.from(pickupIds))
      : Promise.resolve({ data: [], error: null }),
    dropoffIds.size
      ? supabase.from("Addresses").select("*").in("address_id", Array.from(dropoffIds))
      : Promise.resolve({ data: [], error: null }),
    bleacherIds.size
      ? supabase
          .from("Bleachers")
          .select("bleacher_id, bleacher_number")
          .in("bleacher_id", Array.from(bleacherIds))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (pickupAddressesRes.error)
    console.warn("Pickup addresses fetch error", pickupAddressesRes.error.message);
  if (dropoffAddressesRes.error)
    console.warn("Dropoff addresses fetch error", dropoffAddressesRes.error.message);
  if (bleachersRes.error) console.warn("Bleachers fetch error", bleachersRes.error.message);

  const pickupMap = new Map<number, Address>();
  (pickupAddressesRes.data as unknown as Address[])?.forEach((a) => pickupMap.set(a.address_id, a));
  const dropoffMap = new Map<number, Address>();
  (dropoffAddressesRes.data as unknown as Address[])?.forEach((a) =>
    dropoffMap.set(a.address_id, a)
  );
  const bleacherMap = new Map<number, Bleacher>();
  (bleachersRes.data as unknown as Bleacher[])?.forEach((b) => bleacherMap.set(b.bleacher_id, b));

  // 5. Enrich trackers
  const enriched: EnrichedWorkTracker[] = list.map((t) => ({
    ...t,
    pickup_address: t.pickup_address_id ? pickupMap.get(t.pickup_address_id) : undefined,
    dropoff_address: t.dropoff_address_id ? dropoffMap.get(t.dropoff_address_id) : undefined,
    bleacher: t.bleacher_id ? bleacherMap.get(t.bleacher_id) : undefined,
  }));

  return { workTrackers: enriched };
}
