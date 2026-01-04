import { supabase } from "@/utils/supabase/supabaseClient";

export interface WorkTracker {
  work_tracker_id: number;
  created_at: string;
  user_id: number | null;
  date: string | null; // ISO date (yyyy-mm-dd)
  pickup_time: string | null;
  pickup_address_id: number | null;
  pickup_poc: string | null;
  dropoff_time: string | null;
  dropoff_address_id: number | null;
  dropoff_poc: string | null;
  pay_cents: number | null;
  notes: string | null;
  bleacher_id: number | null;
  internal_notes: string | null;
}

export interface Address {
  address_id: number;
  street: string;
  city: string;
  state_province: string;
  zip_postal: string | null;
}

export interface Bleacher {
  bleacher_id: number;
  bleacher_number: number;
}

export interface EnrichedWorkTracker extends WorkTracker {
  pickup_address?: Address;
  dropoff_address?: Address;
  bleacher?: Bleacher;
}

export type FetchWorkTrackersResult = { workTrackers: EnrichedWorkTracker[] | null };

/**
 * Fetch WorkTrackers belonging to the Clerk user (by clerk_user_id) and enrich with addresses & bleacher number.
 */
export async function fetchWorkTrackersForClerkUser(
  token: string | null,
  clerkUserId: string | undefined | null
): Promise<FetchWorkTrackersResult> {
  if (!clerkUserId) return { workTrackers: null };

  // Debug: Log the token to see if it's being passed
  console.log("[WorkTrackers] Fetching for Clerk user:", clerkUserId);
  console.log("[WorkTrackers] Token available:", !!token, token?.substring(0, 20) + "...");

  // 1. Resolve internal user_id from Users table via clerk_user_id
  const { data: userRow, error: userError } = await supabase
    .from("Users")
    .select("user_id")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (userError || !userRow) {
    console.warn("No matching user for clerk id", clerkUserId);
    console.warn("Error details:", JSON.stringify(userError, null, 2));
    return { workTrackers: [] };
  }
  const userId = userRow.user_id;

  // 2. Fetch trackers for this user
  const { data: trackers, error: trackersError } = await supabase
    .from("WorkTrackers")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (trackersError) {
    console.warn("Failed to fetch WorkTrackers", trackersError.message);
    return { workTrackers: null };
  }

  const list = (trackers as WorkTracker[]) || [];
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
  (pickupAddressesRes.data as Address[]).forEach((a) => pickupMap.set(a.address_id, a));
  const dropoffMap = new Map<number, Address>();
  (dropoffAddressesRes.data as Address[]).forEach((a) => dropoffMap.set(a.address_id, a));
  const bleacherMap = new Map<number, Bleacher>();
  (bleachersRes.data as Bleacher[]).forEach((b) => bleacherMap.set(b.bleacher_id, b));

  // 5. Enrich trackers
  const enriched: EnrichedWorkTracker[] = list.map((t) => ({
    ...t,
    pickup_address: t.pickup_address_id ? pickupMap.get(t.pickup_address_id) : undefined,
    dropoff_address: t.dropoff_address_id ? dropoffMap.get(t.dropoff_address_id) : undefined,
    bleacher: t.bleacher_id ? bleacherMap.get(t.bleacher_id) : undefined,
  }));

  return { workTrackers: enriched };
}
